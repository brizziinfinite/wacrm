/**
 * Meta Instagram Messaging API helpers (Messenger Platform, Instagram
 * product). Mirrors src/lib/whatsapp/meta-api.ts's named-params style
 * for the same reason: swapped-argument bugs surface as TypeScript
 * errors instead of runtime Meta rejections.
 */

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
    `${GRAPH_API_BASE}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  const url = `${GRAPH_API_BASE}/${igsid}?fields=name,username,profile_pic&access_token=${accessToken}`;
  const response = await fetch(url);
  if (!response.ok) {
    await throwGraphError(response, `Instagram API error: ${response.status}`);
  }
  return response.json();
}
