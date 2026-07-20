import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.3.1";

interface QualifierBotContext {
  answers: Record<string, string>;
  questions_asked: number;
  score?: "hot" | "warm" | "cold";
}

interface QualifierQuestion {
  field: string;
  question: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY") || "");

// Single-tenant/global-config assumption: unlike engineSendText (in
// src/lib/automations/meta-send.ts), which resolves a per-account, encrypted
// whatsapp_config row, this reads one global WHATSAPP_PHONE_ID/META_ACCESS_TOKEN
// env var pair. engineSendText is Node-only and unreachable from this Deno edge
// function. Multi-tenant WhatsApp number support would need this function to
// look up whatsapp_config by account_id similarly.
async function sendWhatsAppText(phone: string, text: string): Promise<string | undefined> {
  const whatsappPhoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  const metaToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!whatsappPhoneId || !metaToken) return undefined;

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${whatsappPhoneId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${metaToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone.replace(/\D/g, ""),
        type: "text",
        text: { body: text },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error("Meta API error:", data);
    return undefined;
  }
  return data.messages?.[0]?.id;
}

// Instagram equivalent of sendWhatsAppText. Per-account instagram_config
// (unlike the global WhatsApp env vars) since instagram_config was designed
// account-scoped from the start (migration 043) — no legacy global fallback
// to preserve here.
async function sendInstagramText(
  accountId: string,
  igsid: string,
  text: string
): Promise<string | undefined> {
  const { data: config } = await supabase
    .from("instagram_config")
    .select("access_token")
    .eq("account_id", accountId)
    .single();
  if (!config?.access_token) return undefined;

  const accessToken = await decryptToken(config.access_token);
  if (!accessToken) return undefined;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igsid },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error("Instagram API error:", data);
    return undefined;
  }
  return data.message_id;
}

// AES-256-GCM decrypt matching src/lib/whatsapp/encryption.ts's format
// (hex "iv:ciphertext:authTag", 12-byte IV, 16-byte auth tag — GCM branch
// only, legacy 2-part CBC format not supported here since instagram_config
// is new and every row is written by the current encrypt()). Reimplemented
// here because Deno edge functions can't import from src/lib (Node-only
// crypto import style) — same constraint noted above for the WhatsApp side.
async function decryptToken(encrypted: string): Promise<string | undefined> {
  const keyHex = Deno.env.get("ENCRYPTION_KEY");
  if (!keyHex) {
    console.error("ENCRYPTION_KEY not set — cannot decrypt instagram_config.access_token");
    return undefined;
  }
  try {
    const [ivHex, ciphertextHex, authTagHex] = encrypted.split(":");
    const keyBytes = hexToBytes(keyHex);
    const iv = hexToBytes(ivHex);
    const authTag = hexToBytes(authTagHex);
    const ciphertext = hexToBytes(ciphertextHex);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    // Web Crypto expects ciphertext+authTag concatenated for AES-GCM.
    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext);
    combined.set(authTag, ciphertext.length);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      combined
    );
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    console.error("Failed to decrypt instagram_config.access_token:", err);
    return undefined;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

interface QualifierContact {
  phone: string | null;
  channel: string | null;
  external_id: string | null;
}

// Dispatches to the right channel based on contact.channel — the single
// send point both call sites below go through.
async function sendText(
  accountId: string,
  contact: QualifierContact,
  text: string
): Promise<string | undefined> {
  if (contact.channel === "instagram" && contact.external_id) {
    return sendInstagramText(accountId, contact.external_id, text);
  }
  if (!contact.phone) return undefined;
  return sendWhatsAppText(contact.phone, text);
}

async function logOutboundMessage(
  conversationId: string,
  accountId: string,
  text: string,
  metaMessageId?: string
) {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "bot",
    content_type: "text",
    content_text: text,
    message_id: metaMessageId ?? null,
    status: "sent",
  });
  // account_id is not a messages column per 001_initial_schema.sql — omitted intentionally.
  void accountId;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { conversation_id, account_id, contact_id, message_text } = await req.json();

    if (!conversation_id || !account_id || !contact_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const { data: config, error: configError } = await supabase
      .from("ai_qualifier_configs")
      .select("*")
      .eq("account_id", account_id)
      .single();

    if (configError || !config?.enabled) {
      return new Response(JSON.stringify({ error: "Qualifier not configured or disabled" }), { status: 400 });
    }

    const questions: QualifierQuestion[] = config.questions ?? [];
    if (questions.length === 0) {
      return new Response(JSON.stringify({ error: "No questions configured" }), { status: 400 });
    }

    // Defense in depth: this function uses the service-role client (bypassing
    // RLS), so scope the lookup by account_id, not just id.
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("bot_context")
      .eq("id", conversation_id)
      .eq("account_id", account_id)
      .single();

    if (convError) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const botContext: QualifierBotContext = conv?.bot_context?.answers
      ? conv.bot_context
      : { answers: {}, questions_asked: 0 };

    // Defense in depth: this function uses the service-role client (bypassing
    // RLS), so scope the lookup by account_id, not just id.
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone, channel, external_id")
      .eq("id", contact_id)
      .eq("account_id", account_id)
      .single();

    if (!contact || (contact.channel !== "instagram" && !contact.phone)) {
      return new Response(JSON.stringify({ error: "Contact phone not found" }), { status: 400 });
    }

    // Record the answer to the previous question, if one was pending.
    if (botContext.questions_asked > 0 && botContext.questions_asked <= questions.length && message_text) {
      const prevField = questions[botContext.questions_asked - 1].field;
      botContext.answers[prevField] = message_text;
    }

    // More questions to ask?
    if (botContext.questions_asked < questions.length) {
      const nextQuestion = questions[botContext.questions_asked];
      botContext.questions_asked += 1;

      await supabase
        .from("conversations")
        .update({ bot_context: botContext, updated_at: new Date().toISOString() })
        .eq("id", conversation_id);

      const messageId = await sendText(account_id, contact, nextQuestion.question);
      await logOutboundMessage(conversation_id, account_id, nextQuestion.question, messageId);

      return new Response(JSON.stringify({ done: false, next_field: nextQuestion.field }), { status: 200 });
    }

    // All questions answered — score the lead.
    const model = genAI.getGenerativeModel({ model: config.model });
    const scoringPrompt = `${config.qualify_prompt}\n\nRespostas coletadas:\n${JSON.stringify(botContext.answers, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: scoringPrompt }] }],
      generationConfig: { temperature: config.temperature, maxOutputTokens: 128 },
    });

    const rawText = result.response.text().trim();
    let score: "hot" | "warm" | "cold" = "cold";
    let reason = "";
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      if (parsed.score === "hot" || parsed.score === "warm" || parsed.score === "cold") {
        score = parsed.score;
      }
      reason = typeof parsed.reason === "string" ? parsed.reason : "";
    } catch (parseErr) {
      console.error("Failed to parse Gemini scoring response:", rawText, parseErr);
    }

    botContext.score = score;
    await supabase
      .from("conversations")
      .update({ bot_context: botContext, bot_type: "inactive", updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    const thankYouMessage = "Obrigado pelas informações! Um especialista vai continuar sua atendimento em breve.";
    const messageId = await sendText(account_id, contact, thankYouMessage);
    await logOutboundMessage(conversation_id, account_id, thankYouMessage, messageId);

    // Delegate deal/tag creation to the existing Automations engine.
    const dispatchUrl = `${Deno.env.get("APP_BASE_URL")}/api/automations/dispatch-internal`;
    const dispatchToken = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    fetch(dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dispatchToken}`,
      },
      body: JSON.stringify({
        accountId: account_id,
        triggerType: "lead_qualified",
        contactId: contact_id,
        context: { vars: { score, reason } },
      }),
    }).catch((err) => console.error("Failed to dispatch lead_qualified automation:", err));

    return new Response(JSON.stringify({ done: true, score, reason }), { status: 200 });
  } catch (error) {
    console.error("Error in qualify-lead:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});
