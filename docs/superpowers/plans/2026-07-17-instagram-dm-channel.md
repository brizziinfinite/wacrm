# Instagram DM Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Instagram Direct Messages into the shared inbox as a first-class channel — same conversation list, same AI chatbot/qualifier bots, same Flows/Automations engine — so a lead who DMs on Instagram gets the identical automated pipeline a WhatsApp lead gets today.

**Architecture:** Generalize `contacts`/`conversations` from phone-only to multi-channel (add `channel` + nullable `external_id`, keep `phone` for WhatsApp rows). Add a new webhook route `src/app/api/instagram/webhook/route.ts` that parses Meta's Instagram Messaging payload, normalizes it into the same `ParsedInbound` shape the Flows engine already consumes, and calls the *same* `dispatchInboundToFlows` / `runAutomationsForTrigger` functions the WhatsApp webhook calls. A new `src/lib/instagram/graph-api.ts` mirrors `meta-api.ts` for outbound sends. The inbox UI gets a channel badge/filter; everything else (bot dispatch, pipeline auto-move, tags) is reused unmodified because the engine is already channel-agnostic (confirmed: `dispatchInboundToFlows` takes `contactId`/`accountId`/`ParsedInbound`, no phone assumption inside).

**Tech Stack:** Next.js 16 route handlers, Supabase (Postgres + RLS), Meta Graph API v21.0 (Instagram Messaging via Messenger Platform), existing Gemini bot dispatch (`bot_type` on `conversations`).

## Global Constraints

- Every new/altered table keeps RLS enabled with `is_account_member(account_id)` policies — no exceptions (REGRA #5, and matches every existing migration in this repo).
- Never `SELECT *` in new production code paths — select only needed columns (existing code violates this in places; do not add more).
- No `any` in new TypeScript — the repo uses `any` in a couple of legacy spots (`ContactRow = any` in the WhatsApp webhook) but new code must use explicit types or `unknown`.
- Secrets (Instagram access tokens, app secret) only in Edge Functions / server-side route handlers, never exposed to the client — same pattern as `whatsapp_config.access_token` (AES-256-GCM encrypted at rest via `src/lib/whatsapp/encryption.ts`).
- Reuse `src/lib/whatsapp/encryption.ts` (`encrypt`/`decrypt`) for the Instagram access token column — do not write a second encryption helper.
- Reuse `src/lib/whatsapp/webhook-signature.ts` (`verifyMetaWebhookSignature`) for the Instagram webhook — Meta's `X-Hub-Signature-256` scheme is identical for both products.
- **External blockers, not code:** Instagram Messaging requires (a) `instagram_manage_messages` permission approved via Meta App Review, (b) the Instagram professional account linked to a Facebook Page, (c) all conversations subject to the standard 24-hour customer-service window (free-form replies only within 24h of the user's last message; outside that window only Meta-approved message tags apply — no template system like WhatsApp's exists for Instagram). These gate go-live timing independent of engineering effort — flag to the user before starting Task 1, this plan assumes App Review is either already granted or in progress in parallel.

---

## File Structure

**New files:**
- `supabase/migrations/043_instagram_channel.sql` — schema: `channel` column on `contacts`/`conversations`, `instagram_config` table, dedupe index adjustments.
- `src/lib/instagram/graph-api.ts` — outbound send + user profile fetch (mirrors `src/lib/whatsapp/meta-api.ts`).
- `src/lib/instagram/graph-api.test.ts` — unit tests for the above.
- `src/lib/contacts/channel-dedupe.ts` — `findExistingContactByChannel` (channel-aware version of `findExistingContact`, which stays phone-only for WhatsApp callers).
- `src/lib/contacts/channel-dedupe.test.ts`
- `src/app/api/instagram/webhook/route.ts` — GET (verification) + POST (inbound events), modeled on `src/app/api/whatsapp/webhook/route.ts` but Instagram-shaped and much smaller (no template/status webhook handling — Instagram has none of that).
- `src/app/api/instagram/webhook/route.test.ts`
- `src/app/(dashboard)/settings/instagram/page.tsx` — connect/configure Instagram (paste Page access token + Instagram Business Account ID, same manual-token pattern as `whatsapp_config` setup, since Embedded Signup for Instagram Messaging is a separate, larger OAuth flow deliberately out of scope for v1).

**Modified files:**
- `src/lib/flows/types.ts` — widen `ParsedInbound` is untouched (already generic); no change needed here (confirmed while reading — flagged so the implementer doesn't go looking for a change that isn't there).
- `src/app/api/whatsapp/webhook/route.ts` — `findOrCreateContact`/`findOrCreateConversation` (lines ~1019–1118) become channel-aware wrappers that call the new `channel-dedupe.ts` helper with `channel: 'whatsapp'` — behavior-preserving refactor, covered by existing tests.
- `src/components/inbox/*` — conversation list item and header gain a small channel icon (WhatsApp vs Instagram) so agents can tell them apart at a glance. Exact files identified in Task 6.
- `src/types/index.ts` — add `Channel = 'whatsapp' | 'instagram'` type export.

**Out of scope for this plan (explicitly deferred):**
- Meeting scheduling / Google Calendar integration (separate plan).
- Instagram Embedded Signup OAuth (manual token entry only, like the current WhatsApp config screen already supports as a fallback).
- Instagram comments/Story-reply capture (only Direct Messages — DMs are where the CRM conversation model applies; comments are a Postiz/publishing-side concern, already partially covered by existing `canais` page).
- Voice-cloned audio replies, MCP server exposure — unrelated to this gap.

---

### Task 1: Schema — multi-channel contacts/conversations + instagram_config

**Files:**
- Create: `supabase/migrations/043_instagram_channel.sql`
- Test: manual — apply migration to local Supabase, verify constraints (no automated migration test harness exists in this repo; `supabase/migrations/*.sql` files have no test runner, consistent with existing 42 migrations).

**Interfaces:**
- Produces: `contacts.channel TEXT NOT NULL DEFAULT 'whatsapp'`, `contacts.external_id TEXT` (nullable — holds Instagram-scoped user ID, IGSID), `conversations.channel TEXT NOT NULL DEFAULT 'whatsapp'`, table `instagram_config` (mirrors `whatsapp_config` shape).

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 043: instagram_channel — multi-channel contacts/conversations + Instagram config
--
-- contacts.phone stays NOT NULL for backward compat with every existing
-- row and every WhatsApp code path that reads it directly. Instagram
-- contacts get a synthetic placeholder in `phone` (see backfill below)
-- and their real identity in the new `external_id` column — Instagram
-- DMs are keyed by IGSID (Instagram-scoped ID), not a phone number.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

-- One contact per (account, channel, external_id) for non-WhatsApp
-- channels. WhatsApp dedup keeps using its existing phone-based unique
-- index from migration 022 — untouched.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_channel_external_id
  ON contacts(account_id, channel, external_id)
  WHERE channel != 'whatsapp' AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_contacts_channel ON contacts(channel);

-- Migration 022's unique index is (account_id, phone_normalized) — no
-- channel in the key. phone_normalized is `regexp_replace(phone, '\D',
-- '', 'g')`; our Instagram placeholder `instagram:<igsid>` strips down
-- to just the IGSID's digits. Two Instagram contacts in the same
-- account would collide on that index today (both non-empty,
-- both digits-only), and in the pathological case an IGSID's digits
-- could coincidentally match an existing WhatsApp phone's digits.
-- Widen the key to (account_id, channel, phone_normalized) so each
-- channel dedupes independently — WhatsApp's behavior is byte-for-byte
-- unchanged since every existing row has channel='whatsapp'.
DROP INDEX IF EXISTS idx_contacts_account_phone_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_channel_phone_normalized
  ON contacts (account_id, channel, phone_normalized)
  WHERE phone_normalized <> '';

-- Instagram equivalent of whatsapp_config: one row per connected
-- Instagram professional account, scoped to an account_id (tenant).
CREATE TABLE IF NOT EXISTS instagram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_business_account_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  access_token TEXT NOT NULL, -- encrypted at rest via src/lib/whatsapp/encryption.ts (AES-256-GCM)
  verify_token TEXT NOT NULL, -- encrypted, same helper — used for GET webhook verification
  username TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_config_ig_account
  ON instagram_config(instagram_business_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_config_account_id ON instagram_config(account_id);

ALTER TABLE instagram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY instagram_config_select_account ON instagram_config
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY instagram_config_insert_account ON instagram_config
  FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY instagram_config_update_account ON instagram_config
  FOR UPDATE USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));
CREATE POLICY instagram_config_delete_account ON instagram_config
  FOR DELETE USING (is_account_member(account_id));

COMMENT ON COLUMN contacts.channel IS
  'Channel this contact was acquired on: whatsapp (default) or instagram. Drives which outbound send path (meta-api.ts vs instagram/graph-api.ts) a flow/automation uses.';
COMMENT ON COLUMN contacts.external_id IS
  'Channel-specific identity for non-WhatsApp contacts. For instagram: the IGSID (Instagram-scoped user ID). NULL for whatsapp contacts (phone is their identity).';
COMMENT ON TABLE instagram_config IS
  'Connected Instagram professional account credentials, one row per account_id. Mirrors whatsapp_config.';
```

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset` (or `npx supabase migration up` if already running a local stack — check `supabase/config.toml` for the project ref first).

Expected: migration applies with no errors; `\d contacts` in `psql` shows the new `channel` and `external_id` columns; `\d instagram_config` shows the new table with RLS enabled (`\d+ instagram_config` shows `Row security: enabled`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/043_instagram_channel.sql
git commit -m "feat(db): add multi-channel columns and instagram_config table"
```

---

### Task 2: `channel-dedupe.ts` — channel-aware contact lookup

**Files:**
- Create: `src/lib/contacts/channel-dedupe.ts`
- Create: `src/lib/contacts/channel-dedupe.test.ts`
- Reference (read-only): `src/lib/contacts/dedupe.ts` (existing phone-only helper — do not modify; WhatsApp keeps using it via the Task 5 wrapper).

**Interfaces:**
- Consumes: `SupabaseClient` (from `@supabase/supabase-js`), same as `findExistingContact` in `dedupe.ts`.
- Produces: `findExistingContactByExternalId(db, accountId, channel, externalId): Promise<ExistingContact | null>` — used by Task 4's Instagram webhook and by Task 5's WhatsApp-wrapper refactor is NOT needed here (WhatsApp keeps calling the original `findExistingContact` directly; this new function is Instagram-only, added alongside, not replacing).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/contacts/channel-dedupe.test.ts
import { describe, it, expect, vi } from "vitest";
import { findExistingContactByExternalId } from "./channel-dedupe";

function makeMockDb(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: row, error: null }),
            }),
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("findExistingContactByExternalId", () => {
  it("returns the contact row when found", async () => {
    const db = makeMockDb({ id: "c1", channel: "instagram", external_id: "17841400" });
    const result = await findExistingContactByExternalId(db, "acc1", "instagram", "17841400");
    expect(result).toEqual({ id: "c1", channel: "instagram", external_id: "17841400" });
  });

  it("returns null when no row matches", async () => {
    const db = makeMockDb(null);
    const result = await findExistingContactByExternalId(db, "acc1", "instagram", "missing");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contacts/channel-dedupe.test.ts`
Expected: FAIL — `Cannot find module './channel-dedupe'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/contacts/channel-dedupe.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Channel-scoped contact de-duplication for non-phone identities
 * (Instagram IGSID today; any future channel keyed by an opaque
 * external id reuses this same lookup). WhatsApp keeps using
 * `findExistingContact` in dedupe.ts unchanged — phone matching has
 * different tolerance rules (trunk-prefix match) that don't apply to
 * an opaque platform ID.
 */
export interface ExternalContact {
  id: string;
  channel: string;
  external_id: string | null;
  [key: string]: unknown;
}

export async function findExistingContactByExternalId(
  db: SupabaseClient,
  accountId: string,
  channel: string,
  externalId: string,
): Promise<ExternalContact | null> {
  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExternalContact;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contacts/channel-dedupe.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts/channel-dedupe.ts src/lib/contacts/channel-dedupe.test.ts
git commit -m "feat(contacts): add channel-aware contact lookup for instagram"
```

---

### Task 3: `src/lib/instagram/graph-api.ts` — outbound send + profile fetch

**Files:**
- Create: `src/lib/instagram/graph-api.ts`
- Create: `src/lib/instagram/graph-api.test.ts`
- Reference (read-only): `src/lib/whatsapp/meta-api.ts` (pattern to mirror — named-params style, `throwMetaError` helper).

**Interfaces:**
- Produces: `sendInstagramMessage(args: SendInstagramMessageArgs): Promise<{ messageId: string }>`, `getInstagramUserProfile(args: { igsid: string; accessToken: string }): Promise<{ name?: string; username?: string; profile_pic?: string }>`.
- Consumes: nothing internal — pure `fetch` wrapper, same shape as `meta-api.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/instagram/graph-api.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/instagram/graph-api.test.ts`
Expected: FAIL — `Cannot find module './graph-api'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/instagram/graph-api.ts
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
 * tag outside it (tags not implemented in v1 — see plan's Global
 * Constraints). Meta returns a 10/200 error outside the window; that
 * error's `message` field is surfaced verbatim via throwGraphError.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/instagram/graph-api.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/graph-api.ts src/lib/instagram/graph-api.test.ts
git commit -m "feat(instagram): add Graph API send + profile fetch helpers"
```

---

### Task 4: Instagram webhook route — inbound DM → same Flows/Automations dispatch

**Files:**
- Create: `src/app/api/instagram/webhook/route.ts`
- Create: `src/app/api/instagram/webhook/route.test.ts`
- Reference (read-only): `src/app/api/whatsapp/webhook/route.ts` (pattern — GET verification + POST inbound, `verifyMetaWebhookSignature`, `dispatchInboundToFlows`, `runAutomationsForTrigger`).

**Interfaces:**
- Consumes: `verifyMetaWebhookSignature` (from `src/lib/whatsapp/webhook-signature.ts` — channel-agnostic, works on any Meta payload since the HMAC scheme is identical), `findExistingContactByExternalId` (Task 2), `sendInstagramMessage`/`getInstagramUserProfile` (Task 3), `dispatchInboundToFlows` (existing, from `src/lib/flows/engine.ts`), `runAutomationsForTrigger` (existing, from `src/lib/automations/engine.ts`).
- Produces: nothing new consumed by later tasks — this is the terminal integration point.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/instagram/webhook/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDispatch = vi.fn().mockResolvedValue({ consumed: true, outcome: "started" });
const mockRunAutomations = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/flows/engine", () => ({ dispatchInboundToFlows: mockDispatch }));
vi.mock("@/lib/automations/engine", () => ({ runAutomationsForTrigger: mockRunAutomations }));
vi.mock("@/lib/whatsapp/webhook-signature", () => ({
  verifyMetaWebhookSignature: vi.fn().mockReturnValue(true),
}));

const mockConfig = {
  id: "cfg1",
  account_id: "acc1",
  user_id: "user1",
  instagram_business_account_id: "17841400000000",
  access_token: "encrypted-token",
};

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
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: "conv1", channel: "instagram" }, error: null }),
          }),
        }),
      };
    }
    if (table === "messages") {
      return { insert: () => Promise.resolve({ error: null }) };
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
    expect(dispatchArg.message).toEqual({
      kind: "text",
      text: "Olá, quero saber sobre o Pro",
      meta_message_id: "mid.123",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/instagram/webhook/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/instagram/webhook/route.ts
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

  if (!verifyMetaWebhookSignature(rawBody, signature, process.env.META_APP_SECRET ?? "")) {
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

  if (!contact) {
    const profile = await getInstagramUserProfile({ igsid, accessToken }).catch(() => ({}));
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

  const { data: conversation } = await supabaseAdmin()
    .from("conversations")
    .select("*")
    .eq("account_id", config.account_id)
    .eq("contact_id", contact.id)
    .maybeSingle();

  let conversationId = conversation?.id;
  if (!conversationId) {
    const { data: newConv, error } = await supabaseAdmin()
      .from("conversations")
      .insert({
        account_id: config.account_id,
        user_id: config.user_id,
        contact_id: contact.id,
        channel: "instagram",
      })
      .select()
      .single();
    if (error || !newConv) {
      console.error("[instagram webhook] failed to create conversation:", error);
      return;
    }
    conversationId = newConv.id;
  }

  await supabaseAdmin().from("messages").insert({
    conversation_id: conversationId,
    contact_id: contact.id,
    direction: "inbound",
    content_type: "text",
    content_text: event.message!.text,
    meta_message_id: event.message!.mid,
  });

  const parsedMessage: ParsedInbound = {
    kind: "text",
    text: event.message!.text!,
    meta_message_id: event.message!.mid,
  };

  const flowResult = await dispatchInboundToFlows({
    accountId: config.account_id,
    contactId: contact.id,
    conversationId,
    message: parsedMessage,
    isFirstInboundMessage: !conversation,
  });

  if (!flowResult.consumed) {
    await runAutomationsForTrigger({
      accountId: config.account_id,
      contactId: contact.id,
      conversationId,
      trigger: "inbound_message",
      message: parsedMessage,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/instagram/webhook/route.test.ts`
Expected: PASS (1 test). If `dispatchInboundToFlows`/`runAutomationsForTrigger` signatures differ from what's assumed here (`conversationId`, `trigger` field names), check `src/lib/flows/types.ts:332-342` (`DispatchInboundInput`) and `src/lib/automations/engine.ts`'s `DispatchInput` type and adjust the call sites — do not guess, read the actual interface first.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/instagram/webhook/route.ts src/app/api/instagram/webhook/route.test.ts
git commit -m "feat(instagram): add webhook route dispatching DMs into flows/automations engine"
```

---

### Task 5: Refactor WhatsApp webhook's contact/conversation creation to stamp `channel: 'whatsapp'`

**Files:**
- Modify: `src/app/api/whatsapp/webhook/route.ts:1052-1059` (contact insert), `:1100-1108` (conversation insert)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a data-consistency fix so every row (old and new) is queryable by `channel` uniformly. Existing rows default to `'whatsapp'` via the column default from migration 043, so no backfill needed for old data — only new inserts need the explicit stamp for clarity (the DEFAULT already covers it, but explicit is better than implicit for a column other code branches on).

- [ ] **Step 1: Add `channel: 'whatsapp'` to the contact insert**

In `src/app/api/whatsapp/webhook/route.ts`, the `findOrCreateContact` function's insert call (around line 1052):

```typescript
  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      channel: 'whatsapp',
      phone,
      name: name || phone,
    })
    .select()
    .single()
```

- [ ] **Step 2: Add `channel: 'whatsapp'` to the conversation insert**

Same file, `findOrCreateConversation` function's insert call (around line 1100):

```typescript
  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
      channel: 'whatsapp',
      whatsapp_client_id: whatsappClientId,
      whatsapp_from_number: whatsappFromNumber,
    })
    .select()
    .single()
```

- [ ] **Step 3: Run existing webhook tests to confirm no regression**

Run: `npx vitest run src/app/api/whatsapp/webhook`
Expected: PASS — all existing tests green (this change is additive to the insert payload, doesn't alter behavior existing tests assert on).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/webhook/route.ts
git commit -m "chore(whatsapp): explicitly stamp channel='whatsapp' on new contacts/conversations"
```

---

### Task 6: Inbox UI — channel badge on conversation list + header

**Files:**
- Modify: conversation list item component and conversation header component under `src/components/inbox/` — run `grep -rn "last_message_text\|assigned_agent_id" src/components/inbox/*.tsx` first to find the exact list-item file (component names weren't fully enumerated during planning; the implementer must locate them before editing — this is a discovery step, not a guess).
- Modify: `src/types/index.ts` — add `export type Channel = "whatsapp" | "instagram";`

**Interfaces:**
- Consumes: `conversation.channel` (string) from the Supabase row, now populated by Tasks 4 & 5.
- Produces: nothing consumed elsewhere — this is the leaf UI task.

- [ ] **Step 1: Locate the conversation list item component**

Run: `grep -rln "unread_count\|last_message_at" src/components/inbox/*.tsx`

Expected: one or two files (likely a `ConversationListItem.tsx`-style component and possibly a `ConversationHeader.tsx`). Read whichever file renders the avatar/name row in the inbox list before editing.

- [ ] **Step 2: Add the `Channel` type**

In `src/types/index.ts`, add:

```typescript
export type Channel = "whatsapp" | "instagram";
```

- [ ] **Step 3: Add a channel icon next to the contact name in the list item**

In the located list-item component, import `MessageCircle` (WhatsApp-style) and `Instagram` from `lucide-react` (already a project dependency — confirmed via `canais/page.tsx`'s existing `lucide-react` imports), and render one based on `conversation.channel`:

```tsx
import { Instagram, MessageCircle } from "lucide-react";

// Inside the render, next to the contact name:
{conversation.channel === "instagram" ? (
  <Instagram className="h-3.5 w-3.5 text-pink-500" aria-label="Instagram" />
) : (
  <MessageCircle className="h-3.5 w-3.5 text-green-500" aria-label="WhatsApp" />
)}
```

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`, open `/inbox`, confirm existing WhatsApp conversations still render (green icon), and that the layout doesn't break with the added icon (check on a narrow viewport too — inbox list items are typically tight on space).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/components/inbox/
git commit -m "feat(inbox): show channel icon on conversation list items"
```

---

### Task 7: Instagram settings page — connect account (manual token entry)

**Files:**
- Create: `src/app/(dashboard)/settings/instagram/page.tsx`
- Reference (read-only): whichever page currently renders WhatsApp config under `src/app/(dashboard)/settings/` — find it with `grep -rln "whatsapp_config" src/app/\(dashboard\)/settings/` and follow its exact form pattern (fields, save handler, toast usage) rather than inventing a new one.

**Interfaces:**
- Consumes: Supabase client (`@/lib/supabase/client`), `instagram_config` table (Task 1).
- Produces: nothing consumed by other tasks — this is the terminal UI task for account setup.

- [ ] **Step 1: Locate and read the WhatsApp settings page pattern**

Run: `grep -rln "whatsapp_config" "src/app/(dashboard)/settings/"`

Read the returned file fully before writing Task 7's page — copy its structure (loading state, save-on-submit, encrypted-field handling via a server action or API route, toast feedback) rather than designing a new pattern. This repo already solved "how do we let a user paste a Meta access token safely" once; do not solve it a second, different way.

- [ ] **Step 2: Build the Instagram settings page following that pattern**

Fields needed: `instagram_business_account_id`, `page_id`, `access_token` (paste, masked input), `verify_token` (auto-generated or pasted, same as WhatsApp's). Save via a POST to a new `src/app/api/instagram/config/route.ts` that encrypts `access_token`/`verify_token` with `src/lib/whatsapp/encryption.ts`'s `encrypt()` before the insert — mirror whatever `src/app/api/whatsapp/config/route.ts` does for its encryption step exactly (read that file's POST handler before writing this one).

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, navigate to `/settings/instagram`, submit a test row with dummy values, confirm it lands in `instagram_config` with `access_token` encrypted (check via `psql` that the stored value isn't the plaintext you typed).

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/settings/instagram/ src/app/api/instagram/config/
git commit -m "feat(instagram): add settings page and config API route for connecting an account"
```

---

## Self-Review Notes

- **Spec coverage:** Instagram DM inbound → inbox (Task 4, 6), same AI bot/qualifier dispatch (reused as-is via `dispatchInboundToFlows`/`runAutomationsForTrigger`, no new task needed — confirmed these functions are channel-agnostic), outbound send (Task 3), account connection (Task 7), schema (Task 1), WhatsApp non-regression (Task 5). Not covered by design: Instagram comments/story-reply automation, Embedded Signup OAuth, message tags for outside-24h-window sends — all explicitly deferred in "Out of scope."
- **External blockers restated:** Meta App Review for `instagram_manage_messages` and Page-to-Instagram linkage are prerequisites Task 4/7 cannot be tested against a real Instagram account until granted — Tasks 1-6 are fully testable with mocked payloads/unit tests in the meantime, only Task 7's live browser verification and true end-to-end webhook delivery need the real credentials.
- **Type consistency check:** `ParsedInbound` (Task 4) matches the existing `text` variant shape from `src/lib/flows/types.ts:316-322` exactly (`kind`, `text`, `meta_message_id`) — confirmed against the file, not assumed.
