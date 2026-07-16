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
      .select("phone")
      .eq("id", contact_id)
      .eq("account_id", account_id)
      .single();

    if (!contact?.phone) {
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

      const messageId = await sendWhatsAppText(contact.phone, nextQuestion.question);
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
    const messageId = await sendWhatsAppText(contact.phone, thankYouMessage);
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
