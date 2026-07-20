/**
 * Meta Instagram Messaging API helpers (Messenger Platform, Instagram
 * product). Mirrors src/lib/whatsapp/meta-api.ts's named-params style
 * for the same reason: swapped-argument bugs surface as TypeScript
 * errors instead of runtime Meta rejections.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface MetaErrorResponse {
  error?: { message?: string; code?: number };
}

async function throwGraphError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = (await response.json()) as MetaErrorResponse;
    if (data.error?.message) message = data.error.message;
  } catch {
    // body wasn't JSON — keep fallback
  }
  throw new Error(message);
}

export interface SendInstagramMessageArgs {
  /** Instagram-scoped user ID of the recipient. */
  igsid: string;
  text: string;
  pageAccessToken: string;
}

export interface SendInstagramMessageResult {
  messageId: string;
}

/**
 * Send a text DM. Only valid within Meta's 24-hour customer-service
 * window from the user's last message, or using an approved message
 * tag outside it (tags not implemented in v1). Meta returns an error
 * outside the window; that error's `message` field is surfaced
 * verbatim via throwGraphError.
 */
export async function sendInstagramMessage(
  args: SendInstagramMessageArgs,
): Promise<SendInstagramMessageResult> {
  const { igsid, text, pageAccessToken } = args;
  const response = await fetch(
    `${GRAPH_API_BASE}/me/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: igsid },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    },
  );

  if (!response.ok) {
    await throwGraphError(response, `Instagram API error: ${response.status}`);
  }
  const data = (await response.json()) as { message_id: string };
  return { messageId: data.message_id };
}

export interface InstagramUserProfile {
  name?: string;
  username?: string;
  profile_pic?: string;
}

export interface GetInstagramUserProfileArgs {
  igsid: string;
  accessToken: string;
}

export async function getInstagramUserProfile(
  args: GetInstagramUserProfileArgs,
): Promise<InstagramUserProfile> {
  const { igsid, accessToken } = args;
  const url = `${GRAPH_API_BASE}/${igsid}?fields=name,username,profile_pic`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await throwGraphError(response, `Instagram API error: ${response.status}`);
  }
  return response.json();
}

export interface SendInstagramAndLogArgs {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  igsid: string;
  text: string;
}

/**
 * Shared by both send engines (automations/meta-send.ts and
 * flows/meta-send.ts): resolve the account's instagram_config, send the
 * DM, persist the outgoing message, and bump the conversation preview.
 * Extracted here to stop the two engines from carrying byte-identical
 * copies of this block.
 */
export async function sendInstagramTextAndLog(
  args: SendInstagramAndLogArgs,
): Promise<{ messageId: string }> {
  const { db, accountId, conversationId, igsid, text } = args;

  const { data: igConfig, error: igConfigErr } = await db
    .from("instagram_config")
    .select("access_token")
    .eq("account_id", accountId)
    .single();
  if (igConfigErr || !igConfig) {
    throw new Error("Instagram not configured for this account");
  }

  const { messageId } = await sendInstagramMessage({
    igsid,
    text,
    pageAccessToken: decrypt(igConfig.access_token),
  });

  const { error: igMsgErr } = await db.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "bot",
    content_type: "text",
    content_text: text,
    message_id: messageId,
    status: "sent",
  });
  if (igMsgErr) {
    throw new Error(`sent to Meta but DB insert failed: ${igMsgErr.message}`);
  }

  await db
    .from("conversations")
    .update({
      last_message_text: text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  return { messageId };
}
