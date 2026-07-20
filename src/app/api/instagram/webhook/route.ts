import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp/webhook-signature";
import { findExistingContactByExternalId } from "@/lib/contacts/channel-dedupe";
import { getInstagramUserProfile } from "@/lib/instagram/graph-api";
import { runAutomationsForTrigger } from "@/lib/automations/engine";
import { dispatchInboundToFlows } from "@/lib/flows/engine";
import type { ParsedInbound } from "@/lib/flows/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _adminClient;
}

interface InstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string };
}

interface InstagramWebhookBody {
  object: string;
  entry: Array<{
    id: string; // Instagram business account id
    messaging?: InstagramMessagingEvent[];
  }>;
}

// GET - Webhook verification (same handshake as WhatsApp's, Meta reuses
// the challenge/verify_token protocol across every product).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge || !verifyToken) {
    return NextResponse.json({ error: "Missing verification parameters" }, { status: 400 });
  }

  const { data: configs } = await supabaseAdmin()
    .from("instagram_config")
    .select("id, verify_token");

  const matched = (configs ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c.verify_token && decrypt(c.verify_token) === verifyToken,
  );

  if (!matched) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as InstagramWebhookBody;

  for (const entry of body.entry) {
    const igBusinessAccountId = entry.id;
    const { data: config } = await supabaseAdmin()
      .from("instagram_config")
      .select("id, account_id, user_id, access_token")
      .eq("instagram_business_account_id", igBusinessAccountId)
      .maybeSingle();

    if (!config) {
      console.error("[instagram webhook] no config for ig_business_account_id:", igBusinessAccountId);
      continue;
    }

    for (const event of entry.messaging ?? []) {
      if (!event.message?.text) continue; // v1: text only, mirrors what the flow engine's ParsedInbound understands
      await processInboundMessage(config, event);
    }
  }

  return NextResponse.json({ status: "ok" });
}

interface InstagramConfigRow {
  id: string;
  account_id: string;
  user_id: string;
  access_token: string;
}

async function processInboundMessage(
  config: InstagramConfigRow,
  event: InstagramMessagingEvent,
) {
  const igsid = event.sender.id;
  const accessToken = decrypt(config.access_token);

  let contact = await findExistingContactByExternalId(
    supabaseAdmin(),
    config.account_id,
    "instagram",
    igsid,
  );
  const wasCreated = !contact;

  if (!contact) {
    const profile = await getInstagramUserProfile({ igsid, accessToken }).catch(() => ({}) as { name?: string; username?: string });
    const { data: newContact, error } = await supabaseAdmin()
      .from("contacts")
      .insert({
        account_id: config.account_id,
        user_id: config.user_id,
        channel: "instagram",
        external_id: igsid,
        phone: `instagram:${igsid}`, // contacts.phone is NOT NULL; placeholder for non-whatsapp channels
        name: profile.name || profile.username || igsid,
      })
      .select()
      .single();
    if (error || !newContact) {
      console.error("[instagram webhook] failed to create contact:", error);
      return;
    }
    contact = newContact;
  }
  const contactRecord = contact!;

  const { data: existingConversation } = await supabaseAdmin()
    .from("conversations")
    .select("*")
    .eq("account_id", config.account_id)
    .eq("contact_id", contactRecord.id)
    .maybeSingle();

  let conversation = existingConversation;
  if (!conversation) {
    const { data: newConv, error } = await supabaseAdmin()
      .from("conversations")
      .insert({
        account_id: config.account_id,
        user_id: config.user_id,
        contact_id: contactRecord.id,
        channel: "instagram",
      })
      .select()
      .single();
    if (error || !newConv) {
      console.error("[instagram webhook] failed to create conversation:", error);
      return;
    }
    conversation = newConv;
  }

  // Same first-inbound-message check as the WhatsApp route: count prior
  // customer messages on this conversation before inserting the new one.
  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "customer");
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0;

  // messages table has no contact_id/direction/meta_message_id columns —
  // mirrors the WhatsApp route's real insert shape (sender_type, message_id).
  await supabaseAdmin().from("messages").insert({
    conversation_id: conversation.id,
    sender_type: "customer",
    content_type: "text",
    content_text: event.message!.text,
    message_id: event.message!.mid,
    status: "delivered",
  });

  // AI Chatbot / Lead Qualifier dispatch — same bot_type-gated fetch to
  // the edge functions as the WhatsApp route (route.ts ~671-738). Gap
  // found via review: without this, an Instagram DM never reaches the
  // qualifier/chatbot at all, even though the edge functions themselves
  // now support sending the reply back over Instagram (sendText branch
  // added in qualify-lead/process-ai-messages).
  const { data: convBotData } = await supabaseAdmin()
    .from("conversations")
    .select("bot_type, bot_context")
    .eq("id", conversation.id)
    .single();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (convBotData?.bot_type === "gemini" && supabaseUrl && serviceRoleKey) {
    fetch(`${supabaseUrl}/functions/v1/process-ai-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: conversation.id,
        account_id: config.account_id,
        contact_id: contactRecord.id,
        message_body: event.message!.text,
      }),
    }).catch((err) => console.error("[ai-chatbot] request failed:", err));

    if (!convBotData?.bot_context) {
      await supabaseAdmin()
        .from("conversations")
        .update({ bot_context: { messages: [] } })
        .eq("id", conversation.id);
    }
  }

  if (convBotData?.bot_type === "qualifier" && supabaseUrl && serviceRoleKey) {
    fetch(`${supabaseUrl}/functions/v1/qualify-lead`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: conversation.id,
        account_id: config.account_id,
        contact_id: contactRecord.id,
        message_text: event.message!.text,
      }),
    }).catch((err) => console.error("[qualify-lead] request failed:", err));
  }

  const parsedMessage: ParsedInbound = {
    kind: "text",
    text: event.message!.text!,
    meta_message_id: event.message!.mid,
  };

  const flowResult = await dispatchInboundToFlows({
    accountId: config.account_id,
    userId: config.user_id,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    message: parsedMessage,
    isFirstInboundMessage,
  });

  // Same trigger fan-out as the WhatsApp route: content-level triggers
  // suppressed when a flow consumed the message, relationship-level
  // triggers always fire. Fire-and-forget — never blocks the 200 OK.
  const automationTriggers: (
    | "new_contact_created"
    | "first_inbound_message"
    | "new_message_received"
    | "keyword_match"
  )[] = [];
  if (!flowResult.consumed) {
    automationTriggers.push("new_message_received", "keyword_match");
  }
  if (wasCreated) automationTriggers.unshift("new_contact_created");
  if (isFirstInboundMessage) automationTriggers.unshift("first_inbound_message");

  for (const triggerType of automationTriggers) {
    runAutomationsForTrigger({
      accountId: config.account_id,
      triggerType,
      contactId: contactRecord.id,
      context: {
        message_text: event.message!.text ?? "",
        conversation_id: conversation.id,
      },
    }).catch((err: unknown) => console.error("[automations] dispatch failed:", err));
  }
}
