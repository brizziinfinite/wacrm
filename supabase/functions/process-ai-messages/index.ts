import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.3.1";

interface BotContext {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_name?: string;
  user_phone?: string;
  user_email?: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY") || "");

interface ChatbotContact {
  phone: string | null;
  channel: string | null;
  external_id: string | null;
}

// Same global-config WhatsApp / per-account Instagram split as
// qualify-lead's sendText — see that function's comment for why.
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
// (hex "iv:ciphertext:authTag"). See qualify-lead/index.ts's identical
// function for the full rationale — duplicated because Deno edge
// functions can't share a module outside their own directory here.
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

async function sendText(
  accountId: string,
  contact: ChatbotContact,
  text: string
): Promise<string | undefined> {
  if (contact.channel === "instagram" && contact.external_id) {
    return sendInstagramText(accountId, contact.external_id, text);
  }
  if (!contact.phone) return undefined;
  return sendWhatsAppText(contact.phone, text);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const {
      conversation_id,
      account_id,
      contact_id,
      message_body,
      user_name,
      user_phone,
    } = await req.json();

    if (!conversation_id || !account_id || !message_body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // 1. Buscar config do AI Chatbot
    const { data: configData, error: configError } = await supabase
      .from("ai_chatbot_configs")
      .select("*")
      .eq("account_id", account_id)
      .single();

    if (configError || !configData?.enabled) {
      return new Response(
        JSON.stringify({ error: "AI Chatbot not configured or disabled" }),
        { status: 400 }
      );
    }

    const config = configData;

    // 2. Buscar histórico de conversa
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .select("bot_context")
      .eq("id", conversation_id)
      .single();

    if (convError) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404 }
      );
    }

    let botContext: BotContext = convData?.bot_context || {
      messages: [],
      user_name,
      user_phone,
    };

    // 3. Detectar end_keyword (encerrar bot)
    if (
      message_body
        .toLowerCase()
        .includes(config.end_keyword.toLowerCase())
    ) {
      const endMessage = `Entendi. Vou transferir você para um atendente humano. Aguarde um momento...`;

      // Atualizar status para inactive
      await supabase
        .from("conversations")
        .update({ bot_type: "inactive", bot_context: botContext })
        .eq("id", conversation_id);

      // Buscar contato e enviar mensagem de encerramento
      const { data: contactData } = await supabase
        .from("contacts")
        .select("phone, channel, external_id")
        .eq("id", contact_id)
        .single();

      if (contactData) {
        sendText(account_id, contactData, endMessage).catch((err) =>
          console.error("Failed to send end_keyword message:", err)
        );
      }

      return new Response(
        JSON.stringify({
          response: endMessage,
          end_session: true,
        }),
        { status: 200 }
      );
    }

    // 4. Montar mensagens para Gemini
    const messages = [
      ...botContext.messages.map((msg) => ({
        role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: msg.content }],
      })),
      {
        role: "user" as const,
        parts: [{ text: message_body }],
      },
    ];

    // 5. Chamar Gemini
    const model = genAI.getGenerativeModel({ model: config.model });

    const chat = model.startChat({
      history: messages.slice(0, -1), // história sem a última mensagem
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: 256,
      },
      systemInstruction: config.system_prompt,
    });

    const result = await chat.sendMessage(message_body);
    const response = result.response.text();

    // 6. Atualizar histórico
    botContext.messages.push(
      { role: "user", content: message_body },
      { role: "assistant", content: response }
    );

    // Manter últimas 10 mensagens para não encher JSONB
    if (botContext.messages.length > 20) {
      botContext.messages = botContext.messages.slice(-20);
    }

    // 7. Salvar contexto atualizado
    await supabase
      .from("conversations")
      .update({
        bot_context: botContext,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    // 8. Buscar contato
    const { data: contactData, error: contactError } = await supabase
      .from("contacts")
      .select("phone, channel, external_id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contactData || (contactData.channel !== "instagram" && !contactData.phone)) {
      console.error("Contact not found:", contactError);
      return new Response(
        JSON.stringify({ error: "Contact phone not found" }),
        { status: 400 }
      );
    }

    // 9. Enviar resposta (WhatsApp ou Instagram, conforme contactData.channel)
    const metaMessageId = await sendText(account_id, contactData, response);

    // 10. Criar mensagem de resposta no banco (para UI). Columns match
    // messages table schema (001_initial_schema.sql + 010 widening) —
    // sender_type/content_text/content_type/message_id, not the
    // body/direction/from_ai columns this insert used before (those
    // don't exist on the table; the insert was silently failing).
    await supabase.from("messages").insert({
      conversation_id,
      sender_type: "bot",
      content_type: "text",
      content_text: response,
      message_id: metaMessageId ?? null,
      status: "sent",
    });

    return new Response(
      JSON.stringify({
        response,
        end_session: false,
        tokens_used: result.usageMetadata?.totalTokenCount || 0,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in process-ai-messages:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
});
