# AI Lead Qualifier (WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new bot mode (`bot_type = 'qualifier'`) that asks a configurable sequence of qualifying questions over WhatsApp, scores the lead (hot/warm/cold) via Gemini, and automatically creates a deal + applies a tag using the existing Automations engine — no manual agent step required.

**Architecture:** New Supabase Edge Function `qualify-lead` (Deno), invoked fire-and-forget from the existing webhook route exactly like `process-ai-messages` is today, but gated on a new `bot_type` value. State machine progress (which question we're on, answers collected so far) is stored in the existing `conversations.bot_context` JSONB column — no new state table. Final scoring action (create deal / add tag) is delegated to the existing `runAutomationsForTrigger` dispatch via a new trigger type `lead_qualified`, so no new deal/tag-writing code is needed — the Automations engine already does this correctly (tenancy checks, logging, error handling).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Edge Functions/Deno), `@google/generative-ai` (Gemini, matches existing `process-ai-messages` integration — no new LLM vendor).

## Global Constraints

- Reuse `engineSendText` (`src/lib/automations/meta-send.ts:46`) for all outbound sends from the new engine code — do not hand-roll a `fetch` to Meta Graph API (the existing `process-ai-messages` function does this and has a known host bug — `graph.instagram.com` instead of `graph.facebook.com` — do not copy it).
- Reuse `messages` table's real schema (`sender_type`, `content_text`, `content_type`, `message_id`, `status`) — the existing `process-ai-messages` function inserts non-existent columns (`body`, `direction`, `from_ai`); do not copy that pattern.
- All new tables get `account_id` tenancy + RLS policies via `is_account_member(account_id)`, matching `038_ai_chatbot.sql`.
- Final deal/tag creation must go through `runAutomationsForTrigger` (`src/lib/automations/engine.ts:57`) — do not write directly to `deals`/`contact_tags` from the edge function.
- TypeScript only, no `any` — use `unknown` + narrowing where the Gemini JSON response is parsed.
- Migration numbering: repo is currently at `043_evolution_provider.sql` as the highest migration seen during exploration — verify the actual highest-numbered file before naming the new migration and use the next integer.

---

## File Structure

- **Create:** `supabase/migrations/0NN_ai_qualifier.sql` — `ai_qualifier_configs` table, `conversations.bot_type` CHECK extended to include `'qualifier'`, new automation trigger type `lead_qualified` (extends the existing `trigger_type TEXT` column — no CHECK constraint to alter per `006_automations.sql`, confirm during Task 1).
- **Create:** `supabase/functions/qualify-lead/index.ts` — the qualifier edge function (question state machine + scoring call + automation dispatch trigger).
- **Modify:** `src/app/api/whatsapp/webhook/route.ts` — add a fourth dispatch branch alongside the existing AI-chatbot branch (~`route.ts:672-716`), gated on `bot_type === 'qualifier'`.
- **Modify:** `src/types/index.ts` — add `'lead_qualified'` to `AutomationTriggerType` (`index.ts:371-378`), add `AiQualifierConfig` interface.
- **Create:** `src/components/settings/ai-qualifier-settings.tsx` — config UI (questions list + pipeline/stage/tag mapping), modeled on `src/components/settings/ai-chatbot-settings.tsx`.
- **Create:** `src/hooks/use-ai-qualifier.ts` — data hook for `ai_qualifier_configs`, modeled on `src/hooks/use-ai-chatbot.ts`.
- **Create:** `src/app/api/ai-qualifier/config/route.ts` — CRUD for `ai_qualifier_configs` (GET/PUT), scoped to the caller's account.

---

## Task 1: Migration — `ai_qualifier_configs` table + `bot_type` + trigger type

**Files:**
- Create: `supabase/migrations/0NN_ai_qualifier.sql` (replace `0NN` with the actual next integer — run the check in Step 1 first)
- Test: manual — apply migration to local Supabase, verify via `psql`/Supabase Studio

**Interfaces:**
- Produces: table `ai_qualifier_configs(id, account_id, enabled, questions, qualify_prompt, hot_pipeline_id, hot_stage_id, hot_tag_id, warm_tag_id, cold_tag_id, model, temperature, created_at, updated_at)`. Consumed by Task 2 (edge function) and Task 6 (config UI/API).

- [ ] **Step 1: Find the actual next migration number**

Run: `ls /Users/brizzi/wacrm/wacrm/supabase/migrations | sort -V | tail -5`
Expected: a list of the 5 highest-numbered migration files. Use `(highest + 1)` zero-padded to 3 digits as `0NN` for the new file. (Exploration found `043_evolution_provider.sql` as the highest seen, but re-check — new migrations may have landed since.)

- [ ] **Step 2: Write the migration file**

```sql
-- Migration 0NN: ai_qualifier — AI-driven lead qualification bot
-- bot_type gains a third value: 'qualifier' (alongside 'gemini', 'typebot', 'inactive')

-- conversations.bot_type has no CHECK constraint (plain TEXT per 038_ai_chatbot.sql:8),
-- so no ALTER needed there — just document the new value.
COMMENT ON COLUMN conversations.bot_type IS
  'Tipo de bot: gemini (IA livre), qualifier (perguntas + score), typebot (visual), inactive (desativado).';

CREATE TABLE IF NOT EXISTS ai_qualifier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  -- Ordered list of questions to ask. Each item: {"field": "orcamento", "question": "Qual seu orçamento mensal?"}
  questions JSONB NOT NULL DEFAULT '[]',
  qualify_prompt TEXT NOT NULL DEFAULT 'Você é um qualificador de leads. Com base nas respostas coletadas, classifique o lead como "hot", "warm" ou "cold". Responda apenas com um JSON: {"score": "hot"|"warm"|"cold", "reason": "..."}.',
  hot_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  hot_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  hot_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  warm_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  cold_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  model TEXT DEFAULT 'gemini-2.5-flash',
  temperature FLOAT DEFAULT 0.3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_qualifier_configs_account_id ON ai_qualifier_configs(account_id);

ALTER TABLE ai_qualifier_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_qualifier_configs_select_account ON ai_qualifier_configs
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_insert_account ON ai_qualifier_configs
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_update_account ON ai_qualifier_configs
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_delete_account ON ai_qualifier_configs
  FOR DELETE
  USING (is_account_member(account_id));

COMMENT ON TABLE ai_qualifier_configs IS
  'Configuração do bot qualificador de leads por account: perguntas, prompt de score, e mapeamento de score -> pipeline/stage/tag.';
COMMENT ON COLUMN ai_qualifier_configs.questions IS
  'Array ordenado de perguntas. Ex: [{"field": "orcamento", "question": "Qual seu orçamento mensal?"}]';
```

- [ ] **Step 3: Apply migration locally and verify**

Run: `cd /Users/brizzi/wacrm/wacrm && supabase db reset` (or `supabase migration up` if using a running local stack — check `supabase/config.toml` for the project's convention first)
Expected: migration applies with no errors; `ai_qualifier_configs` table exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0NN_ai_qualifier.sql
git commit -m "feat(db): add ai_qualifier_configs table for lead qualifier bot"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/types/index.ts:371-378` (add `'lead_qualified'` to `AutomationTriggerType`)
- Modify: `src/types/index.ts` (append new section near the Automations section, after line 494)

**Interfaces:**
- Consumes: nothing (pure type addition)
- Produces: `AiQualifierConfig`, `AiQualifierQuestion` interfaces, consumed by Task 5 (edge function reference only — edge functions are Deno and don't import from `src/types`, but Task 6/7 config UI + API route do), and `AutomationTriggerType` extension consumed by Task 4.

- [ ] **Step 1: Extend `AutomationTriggerType`**

In `src/types/index.ts`, change:
```ts
export type AutomationTriggerType =
  | 'new_message_received'
  | 'first_inbound_message'
  | 'keyword_match'
  | 'new_contact_created'
  | 'conversation_assigned'
  | 'tag_added'
  | 'time_based';
```
to:
```ts
export type AutomationTriggerType =
  | 'new_message_received'
  | 'first_inbound_message'
  | 'keyword_match'
  | 'new_contact_created'
  | 'conversation_assigned'
  | 'tag_added'
  | 'time_based'
  | 'lead_qualified';
```

- [ ] **Step 2: Add `AiQualifierConfig` types**

Append after the Automations section (after line 494, before the next section header):
```ts
// ============================================================
// AI Lead Qualifier (migration 0NN)
// ============================================================

export interface AiQualifierQuestion {
  field: string;
  question: string;
}

export type AiQualifierScore = 'hot' | 'warm' | 'cold';

export interface AiQualifierConfig {
  id: string;
  account_id: string;
  enabled: boolean;
  questions: AiQualifierQuestion[];
  qualify_prompt: string;
  hot_pipeline_id: string | null;
  hot_stage_id: string | null;
  hot_tag_id: string | null;
  warm_tag_id: string | null;
  cold_tag_id: string | null;
  model: string;
  temperature: number;
  created_at: string;
  updated_at: string;
}

/** Shape written into conversations.bot_context while bot_type='qualifier'. */
export interface QualifierBotContext {
  answers: Record<string, string>;
  questions_asked: number;
  score?: AiQualifierScore;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/brizzi/wacrm/wacrm && npx tsc --noEmit`
Expected: no new errors introduced (pre-existing errors, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add AiQualifierConfig and lead_qualified trigger type"
```

---

## Task 3: Automations engine — handle `lead_qualified` trigger

**Files:**
- Modify: `src/lib/automations/engine.ts` — no code change needed IF `lead_qualified` is treated like any other trigger already handled generically by `runAutomationsForTrigger`. Verify this assumption first (Step 1); only add code if the trigger-type switch is exhaustive/closed.
- Test: `src/lib/automations/__tests__/engine.test.ts` (create if no existing test file matches this path — check first) or wherever existing engine tests live.

**Interfaces:**
- Consumes: `AutomationTriggerType` (Task 2), `DispatchInput`/`AutomationContext` (existing, `engine.ts:24-44`).
- Produces: confirms `runAutomationsForTrigger({ accountId, triggerType: 'lead_qualified', contactId, context: { vars: { score, reason } } })` is a valid call the edge function (Task 5) can rely on via HTTP.

- [ ] **Step 1: Check whether the trigger-type switch is exhaustive**

Run: `grep -n "triggerType" /Users/brizzi/wacrm/wacrm/src/lib/automations/engine.ts`
Read the surrounding code at each match. If the engine queries `automations WHERE trigger_type = $1 AND is_active = true` generically (no per-trigger-type branch besides trigger-specific *matching* logic like `keyword_match`'s keyword check), then `lead_qualified` needs zero engine changes — it's data-driven from the `automations.trigger_type` column, and a user just creates an automation row with `trigger_type='lead_qualified'` via the existing automations UI/API.

- [ ] **Step 2: Find where the automation trigger-type dropdown is populated in the UI**

Run: `grep -rn "trigger-meta\|TRIGGER_META\|trigger_type" /Users/brizzi/wacrm/wacrm/src/lib/automations/trigger-meta.ts`
This file (seen during exploration at `src/lib/automations/trigger-meta.ts:9-38`) holds the labels shown in the automation builder UI. Add an entry so `lead_qualified` is selectable when creating a new automation:
```ts
lead_qualified: {
  label: 'Lead qualificado por IA',
  description: 'Disparado quando o agente qualificador de IA termina de pontuar um lead (hot/warm/cold).',
},
```
Match the exact shape of the existing entries in that file (read the file first to confirm the object structure before editing — do not guess the key names).

- [ ] **Step 3: Verify `context.vars` flows through to condition steps**

Run: `grep -n "vars\." /Users/brizzi/wacrm/wacrm/src/lib/automations/engine.ts`
Confirm that `condition` steps with `subject: 'contact_field'` or interpolation like `{{vars.score}}` in `send_message`/`send_webhook` steps can read `context.vars.score` and `context.vars.reason`. This lets account owners build automations like "if vars.score == hot -> create_deal + add_tag" using the *existing* condition step type, rather than needing new step types.

- [ ] **Step 4: Run existing engine tests to confirm no regression**

Run: `cd /Users/brizzi/wacrm/wacrm && npx vitest run src/lib/automations`
Expected: all existing tests pass unchanged (this task only adds a UI label, not engine logic).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations/trigger-meta.ts
git commit -m "feat(automations): add lead_qualified as a selectable trigger type"
```

---

## Task 4: Webhook route — dispatch to qualifier

**Files:**
- Modify: `src/app/api/whatsapp/webhook/route.ts` (add branch near the existing AI-chatbot dispatch, ~line 672-716)

**Interfaces:**
- Consumes: `conversations.bot_type` (existing column, now also `'qualifier'`), the existing pattern of the AI-chatbot fire-and-forget POST (read `route.ts:672-716` in full before writing this task's code — the plan shows the shape based on exploration notes, but the implementer must match exact variable names in scope at that point in the function, e.g. `conversation`, `contact`, `account.id`, `parsedMessage`/`messageText`).
- Produces: an HTTP POST to the new `qualify-lead` edge function (Task 5) with body `{ conversation_id, account_id, contact_id, message_text }`.

- [ ] **Step 1: Read the exact existing AI-chatbot branch**

Run: `sed -n '660,720p' /Users/brizzi/wacrm/wacrm/src/app/api/whatsapp/webhook/route.ts`
Note the exact variable names for: the Supabase edge function base URL env var (likely `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`), the service-role key env var, and the local variables holding `conversation.id`, `contact.id`, `account.id`, and the inbound message text at that point in `processMessage`.

- [ ] **Step 2: Add the qualifier branch immediately after the existing Gemini chatbot branch**

Using the exact variable names found in Step 1 (placeholders below marked `<var>` must be replaced with what Step 1 found — do not guess):

```ts
// AI Lead Qualifier dispatch (bot_type === 'qualifier')
if (<conversation>.bot_type === 'qualifier') {
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qualify-lead`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      conversation_id: <conversation>.id,
      account_id: <account>.id,
      contact_id: <contact>.id,
      message_text: <messageText>,
    }),
  }).catch((err) => console.error('qualify-lead dispatch failed:', err))
}
```

- [ ] **Step 3: Typecheck and build**

Run: `cd /Users/brizzi/wacrm/wacrm && npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/webhook/route.ts
git commit -m "feat(webhook): dispatch inbound messages to qualify-lead when bot_type=qualifier"
```

---

## Task 5: Edge function `qualify-lead`

**Files:**
- Create: `supabase/functions/qualify-lead/index.ts`

**Interfaces:**
- Consumes: HTTP POST body `{ conversation_id, account_id, contact_id, message_text }` (produced by Task 4). Reads `ai_qualifier_configs` (Task 1) and `conversations.bot_context` (existing column, typed as `QualifierBotContext` per Task 2 — note: edge functions are Deno and don't share `src/types` imports, so the shape is duplicated inline here, matching the pattern `process-ai-messages/index.ts` already uses for its own `BotContext` interface).
- Produces: calls `runAutomationsForTrigger`-equivalent via HTTP — since the engine lives in `src/lib/automations/engine.ts` (Next.js server code, not reachable from a Deno edge function directly), the edge function instead calls the existing `POST /api/automations/engine` route (seen during exploration at `src/app/api/automations/engine/route.ts`) with `{ contactId, triggerType: 'lead_qualified', context: { vars: { score, reason } } }`. **Before writing this task's code, read `src/app/api/automations/engine/route.ts` in full to confirm its exact request body shape and auth requirements** (it may expect a user session rather than a service-role bearer token — if so, this task needs a service-role-compatible path; flag this to the user rather than guessing).

- [ ] **Step 1: Read the manual automation trigger route to confirm its contract**

Run: `cat /Users/brizzi/wacrm/wacrm/src/app/api/automations/engine/route.ts`
Determine: (a) exact JSON body shape expected, (b) whether it accepts a service-role bearer token or requires a cookie-based session. If it requires a session (likely, since it's designed for manual UI-triggered testing), this task cannot call it directly from an unauthenticated edge function — instead, import and call `runAutomationsForTrigger` logic by duplicating the minimal dispatch as a direct Postgres write is NOT an option (violates the Global Constraint). In that case, the correct fix is a new internal route `src/app/api/automations/dispatch-internal/route.ts` that accepts a service-role bearer token and calls `runAutomationsForTrigger` directly — add this as Step 1a below if needed.

- [ ] **Step 1a (conditional — only if Step 1 finds session-only auth): Create internal dispatch route**

Create `src/app/api/automations/dispatch-internal/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import type { AutomationTriggerType } from '@/types'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accountId, triggerType, contactId, context } = await req.json() as {
    accountId: string
    triggerType: AutomationTriggerType
    contactId?: string | null
    context?: { vars?: Record<string, unknown> }
  }

  if (!accountId || !triggerType) {
    return NextResponse.json({ error: 'Missing accountId or triggerType' }, { status: 400 })
  }

  await runAutomationsForTrigger({ accountId, triggerType, contactId, context })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the edge function**

```ts
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

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("bot_context")
      .eq("id", conversation_id)
      .single();

    if (convError) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const botContext: QualifierBotContext = conv?.bot_context?.answers
      ? conv.bot_context
      : { answers: {}, questions_asked: 0 };

    const { data: contact } = await supabase
      .from("contacts")
      .select("phone")
      .eq("id", contact_id)
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
```

- [ ] **Step 3: Add `APP_BASE_URL` to edge function secrets documentation**

Check `supabase/functions/.env.example` or equivalent (run `find /Users/brizzi/wacrm/wacrm/supabase/functions -iname "*.env*"` first) — add `APP_BASE_URL` (the deployed Next.js app's own origin, needed so the edge function can call back into `/api/automations/dispatch-internal`) alongside the existing `WHATSAPP_PHONE_ID`, `META_ACCESS_TOKEN`, `GEMINI_API_KEY` secrets.

- [ ] **Step 4: Deploy the edge function**

Run: `cd /Users/brizzi/wacrm/wacrm && supabase functions deploy qualify-lead`
Expected: deploy succeeds. Per REGRA #6 (global instructions), deploy immediately after any Edge Function change.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/qualify-lead/index.ts src/app/api/automations/dispatch-internal/route.ts
git commit -m "feat(qualifier): add qualify-lead edge function and internal automation dispatch route"
```

---

## Task 6: Config API route

**Files:**
- Create: `src/app/api/ai-qualifier/config/route.ts`
- Test: `src/app/api/ai-qualifier/config/route.test.ts` (check existing test conventions first — run `find /Users/brizzi/wacrm/wacrm/src/app/api -name "*.test.ts" | head -3` to see the pattern used for other API route tests, e.g. how they mock Supabase auth)

**Interfaces:**
- Consumes: `AiQualifierConfig` type (Task 2), Supabase server client + session-based account resolution (match whatever pattern `src/app/api/automations/route.ts` already uses for resolving the caller's `account_id` from their session — read that file first).
- Produces: `GET /api/ai-qualifier/config` returns `AiQualifierConfig | null`, `PUT /api/ai-qualifier/config` upserts one, consumed by Task 7 (settings UI via the hook).

- [ ] **Step 1: Read the existing automations CRUD route for the account-resolution pattern**

Run: `cat /Users/brizzi/wacrm/wacrm/src/app/api/automations/route.ts`
Note exactly how it gets the Supabase server client and resolves `account_id` from the authenticated user (likely a shared helper like `getAccountForUser` or similar — grep for it: `grep -rn "getAccountForUser\|resolveAccountId\|account_id" src/app/api/automations/route.ts`).

- [ ] **Step 2: Write the route using that exact pattern**

```ts
import { NextResponse } from 'next/server'
// Import whatever server client + account-resolution helper Step 1 found — placeholder names below.
// import { createServerSupabaseClient } from '@/lib/supabase/server'
// import { getAccountForUser } from '@/lib/accounts'
import type { AiQualifierConfig } from '@/types'

export async function GET() {
  // Mirror the auth + account resolution from src/app/api/automations/route.ts exactly.
  // const supabase = await createServerSupabaseClient()
  // const accountId = await getAccountForUser(supabase)
  // const { data, error } = await supabase
  //   .from('ai_qualifier_configs')
  //   .select('*')
  //   .eq('account_id', accountId)
  //   .maybeSingle()
  // if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // return NextResponse.json(data)
  return NextResponse.json(null) // placeholder until Step 1's exact pattern is substituted in
}

export async function PUT(req: Request) {
  const body = await req.json() as Partial<AiQualifierConfig>
  // Mirror the auth + account resolution from src/app/api/automations/route.ts exactly.
  // const supabase = await createServerSupabaseClient()
  // const accountId = await getAccountForUser(supabase)
  // const { data, error } = await supabase
  //   .from('ai_qualifier_configs')
  //   .upsert({ ...body, account_id: accountId }, { onConflict: 'account_id' })
  //   .select()
  //   .single()
  // if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // return NextResponse.json(data)
  return NextResponse.json(body)
}
```

**Note for implementer:** the commented-out lines above are structural guidance, not placeholders to leave in — Step 1 tells you the real import paths and helper names; replace the comments with real, working code before considering this step done. This is the one task in the plan where the exact helper name genuinely isn't known from exploration and must be read from the live file first.

- [ ] **Step 3: Write a route test matching existing conventions**

Base this on whatever test file Step 1's `find` command surfaced. If e.g. `src/app/api/automations/route.test.ts` mocks the Supabase client and asserts a 200 + JSON shape, mirror that exactly for both GET (empty config → `null`) and PUT (valid body → echoes back with `account_id` set).

- [ ] **Step 4: Run the test**

Run: `cd /Users/brizzi/wacrm/wacrm && npx vitest run src/app/api/ai-qualifier`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai-qualifier/config/route.ts src/app/api/ai-qualifier/config/route.test.ts
git commit -m "feat(api): add ai-qualifier config CRUD route"
```

---

## Task 7: Settings UI

**Files:**
- Create: `src/hooks/use-ai-qualifier.ts`
- Create: `src/components/settings/ai-qualifier-settings.tsx`
- Modify: wherever `AiChatbotSettings` is rendered in the settings page (find via `grep -rn "AiChatbotSettings" src/app`) — add `AiQualifierSettings` alongside it.

**Interfaces:**
- Consumes: `GET`/`PUT /api/ai-qualifier/config` (Task 6), `AiQualifierConfig`/`AiQualifierQuestion` types (Task 2).
- Produces: a working settings panel; no further consumers within this plan.

- [ ] **Step 1: Read the existing hook and component to mirror structure**

Run: `cat /Users/brizzi/wacrm/wacrm/src/hooks/use-ai-chatbot.ts /Users/brizzi/wacrm/wacrm/src/components/settings/ai-chatbot-settings.tsx`

- [ ] **Step 2: Write `use-ai-qualifier.ts`**

Mirror `use-ai-chatbot.ts`'s exact shape (loading/error/data state, fetch on mount, a `save` function calling `PUT`) but pointed at `/api/ai-qualifier/config` and typed with `AiQualifierConfig`. Write the actual hook body by copying `use-ai-chatbot.ts`'s implementation and substituting the URL, type, and default-config shape (`questions: []`, `qualify_prompt: <default from migration>`, etc.) — do not leave this as a description, produce the full file.

- [ ] **Step 3: Write `ai-qualifier-settings.tsx`**

Mirror `ai-chatbot-settings.tsx`'s form structure, but the fields differ: an editable ordered list of `{field, question}` pairs (add/remove/reorder rows), a `qualify_prompt` textarea, three `<select>` dropdowns for `hot_tag_id`/`warm_tag_id`/`cold_tag_id` sourced from the account's `tags` table, and a `hot_pipeline_id` + `hot_stage_id` cascading pair sourced from `pipelines`/`pipeline_stages` (check if an existing pipeline/stage picker component already exists — run `grep -rln "pipeline_id" src/components` to find one to reuse rather than building a new one, per the ladder in ponytail guidance: reuse before building).

- [ ] **Step 4: Wire into the settings page**

Add `<AiQualifierSettings />` next to the existing `<AiChatbotSettings />` render call, found via the Step 1 grep above.

- [ ] **Step 5: Manual browser verification**

Run: `cd /Users/brizzi/wacrm/wacrm && npm run dev`
Navigate to the settings page in a browser, open the new AI Qualifier panel, add 2-3 questions, pick a hot pipeline/stage/tag, save, reload the page, confirm the saved config persists.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-ai-qualifier.ts src/components/settings/ai-qualifier-settings.tsx
git commit -m "feat(ui): add AI qualifier settings panel"
```

---

## Task 8: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Create a test automation**

In the app UI, create an automation with `trigger_type = 'lead_qualified'`, a `condition` step checking `vars.score == 'hot'`, and on the `yes` branch a `create_deal` step + `add_tag` step.

- [ ] **Step 2: Configure the qualifier**

In the new settings panel, add 2 questions (e.g. "Qual seu orçamento?", "Quando pretende comprar?"), a `qualify_prompt` that scores based on those answers, and pick the same pipeline/stage/tags used in Step 1's automation.

- [ ] **Step 3: Set a test conversation's `bot_type` to `'qualifier'`**

Via Supabase Studio or a direct SQL update on a test conversation row: `UPDATE conversations SET bot_type = 'qualifier' WHERE id = '<test conversation id>';`

- [ ] **Step 4: Send WhatsApp messages through the test flow**

Using the WhatsApp test number connected to the dev/staging account, send an inbound message. Confirm: the qualifier asks question 1, then question 2 after replying, then sends the thank-you message, and — if scored hot — a new deal appears in the configured pipeline/stage and the hot tag is applied to the contact.

- [ ] **Step 5: Check `automation_logs`**

Run a query: `SELECT * FROM automation_logs WHERE trigger_event = 'lead_qualified' ORDER BY created_at DESC LIMIT 1;`
Expected: `status = 'success'`, `steps_executed` shows the condition + create_deal + add_tag steps.

---

## Self-Review Notes

- **Spec coverage:** question sequencing (Task 5), scoring via Gemini (Task 5), deal/tag creation via existing engine (Task 3 UI label + Task 5 dispatch + Task 8 verification), config UI (Task 6+7), reuse of `engineSendText`-equivalent send path corrected to real `messages` schema (Task 5, avoids the `process-ai-messages` bug) — all covered.
- **Known open question flagged to implementer, not guessed:** Task 5 Step 1 and Task 6 Step 1 both explicitly require reading live files before writing code, because the exact auth pattern for account resolution and the exact contract of `/api/automations/engine` were not fully read during exploration (only their file paths were confirmed to exist). Do not skip those read steps.
- **Deployment reminder:** per global REGRA #6, `supabase functions deploy qualify-lead` (Task 5 Step 4) must run immediately after any further edits to that function during development, not just once at the end.
