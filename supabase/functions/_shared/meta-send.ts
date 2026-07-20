import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MetaSendContact {
  phone: string | null;
  channel: string | null;
  external_id: string | null;
}

export async function sendWhatsAppText(phone: string, text: string): Promise<string | undefined> {
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

export async function sendInstagramText(
  supabase: SupabaseClient,
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
    `https://graph.facebook.com/v21.0/me/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
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
// (hex "iv:ciphertext:authTag", 12-byte IV, 16-byte auth tag).
export async function decryptToken(encrypted: string): Promise<string | undefined> {
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

export async function sendText(
  supabase: SupabaseClient,
  accountId: string,
  contact: MetaSendContact,
  text: string
): Promise<string | undefined> {
  if (contact.channel === "instagram") {
    if (!contact.external_id) return undefined;
    return sendInstagramText(supabase, accountId, contact.external_id, text);
  }
  if (!contact.phone) return undefined;
  return sendWhatsAppText(contact.phone, text);
}
