import { describe, it, expect, vi, afterEach } from "vitest";
import { sendInstagramMessage } from "./graph-api";

describe("sendInstagramMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to the Graph API messages endpoint and returns the message id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message_id: "mid.123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendInstagramMessage({
      igsid: "1784140099999",
      text: "Olá!",
      pageAccessToken: "TOKEN",
    });

    expect(result).toEqual({ messageId: "mid.123" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/me/messages");
    expect(JSON.parse(options.body)).toEqual({
      recipient: { id: "1784140099999" },
      message: { text: "Olá!" },
      messaging_type: "RESPONSE",
    });
  });

  it("throws Meta's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Outside 24h window" } }),
      }),
    );

    await expect(
      sendInstagramMessage({ igsid: "x", text: "hi", pageAccessToken: "T" }),
    ).rejects.toThrow("Outside 24h window");
  });
});
