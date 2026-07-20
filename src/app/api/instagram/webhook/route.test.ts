import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDispatch, mockRunAutomations } = vi.hoisted(() => ({
  mockDispatch: vi.fn().mockResolvedValue({ consumed: true, outcome: "started" }),
  mockRunAutomations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/flows/engine", () => ({ dispatchInboundToFlows: mockDispatch }));
vi.mock("@/lib/automations/engine", () => ({ runAutomationsForTrigger: mockRunAutomations }));
vi.mock("@/lib/whatsapp/webhook-signature", () => ({
  verifyMetaWebhookSignature: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/instagram/graph-api", () => ({
  getInstagramUserProfile: vi.fn().mockResolvedValue({ name: "Lead Teste" }),
}));

const mockConfig = {
  id: "cfg1",
  account_id: "acc1",
  user_id: "user1",
  instagram_business_account_id: "17841400000000",
  access_token: "encrypted-token",
};

let mockBotType: string | null = null;

const mockSupabaseAdmin = {
  from: vi.fn((table: string) => {
    if (table === "instagram_config") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockConfig, error: null }) }),
        }),
      };
    }
    if (table === "contacts") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "contact1", account_id: "acc1", channel: "instagram" },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "conversations") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            single: () =>
              Promise.resolve({ data: { bot_type: mockBotType, bot_context: null }, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: "conv1", channel: "instagram" }, error: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      };
    }
    if (table === "messages") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
  }),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabaseAdmin,
}));
vi.mock("@/lib/whatsapp/encryption", () => ({
  decrypt: (v: string) => v.replace("encrypted-", ""),
}));

import { POST } from "./route";

describe("Instagram webhook POST", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockRunAutomations.mockClear();
    mockBotType = null;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("parses an inbound text DM and dispatches it to the flow engine", async () => {
    const body = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000",
          messaging: [
            {
              sender: { id: "1784140099999" },
              recipient: { id: "17841400000000" },
              timestamp: 1700000000000,
              message: { mid: "mid.123", text: "Olá, quero saber sobre o Pro" },
            },
          ],
        },
      ],
    };

    const request = new Request("http://localhost/api/instagram/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=fake" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatchArg = mockDispatch.mock.calls[0][0];
    expect(dispatchArg.accountId).toBe("acc1");
    expect(dispatchArg.userId).toBe("user1");
    expect(dispatchArg.message).toEqual({
      kind: "text",
      text: "Olá, quero saber sobre o Pro",
      meta_message_id: "mid.123",
    });
  });

  it("dispatches to qualify-lead when the conversation's bot_type is qualifier", async () => {
    mockBotType = "qualifier";

    const body = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000",
          messaging: [
            {
              sender: { id: "1784140099999" },
              recipient: { id: "17841400000000" },
              timestamp: 1700000000000,
              message: { mid: "mid.999", text: "Quero saber o preço" },
            },
          ],
        },
      ],
    };

    const request = new Request("http://localhost/api/instagram/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=fake" },
      body: JSON.stringify(body),
    });

    await POST(request);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/qualify-lead"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_id: "conv1",
          account_id: "acc1",
          contact_id: "contact1",
          message_text: "Quero saber o preço",
        }),
      }),
    );
  });
});
