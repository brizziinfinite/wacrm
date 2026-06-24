import { createClient } from "jsr:@supabase/supabase-js@2";
import { withRetry } from "../_shared/llm-retry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BrandRow {
  id: string;
  name: string;
  niche: string | null;
  tone: string | null;
  target_persona: string | null;
  pillars: Pillar[];
  forbidden_topics: string[];
}

interface Pillar {
  id: string;
  name: string;
  description: string;
  weight: number;
}

interface WeeklyPriority {
  week_range: string;
  focus: string;
}

interface BrandPlanRow {
  id: string;
  brand_id: string;
  user_id: string;
  goal_primary: string;
  goal_metric: string;
  goal_target_value: number;
  goal_current_value: number;
  current_phase: string;
  current_blocker: string | null;
  main_offer: string | null;
  main_cta: string | null;
  pricing: Record<string, unknown>;
  weekly_priorities: WeeklyPriority[];
  started_at: string;
  deadline: string;
  timeline_days: number;
}

interface ContentIdeaInsert {
  brand_id: string;
  user_id: string;
  plan_id: string;
  angle: string;
  topic: string;
  hook: string;
  detail: string;
  cta: string;
  format: string;
  pillar: string;
  rationale: string;
  contributes_to: string;
  scheduled_for: string;
  week_of: string;
  status: string;
  generated_by: string;
  llm_model: string;
  llm_cost_usd: number;
}

interface LlmIdeaOutput {
  angle: string;
  topic: string;
  hook: string;
  detail: string;
  cta: string;
  format: string;
  pillar: string;
  rationale: string;
  contributes_to: string;
}

interface LlmResponse {
  ideas: LlmIdeaOutput[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const GEMINI_PRICING = { input: 0.30 / 1_000_000, output: 2.50 / 1_000_000 };
const HAIKU_PRICING  = { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 };
const VALID_FORMATS  = ["carrossel", "reel", "story", "blog", "email", "post"] as const;

// ─── Helper: próxima segunda-feira ───────────────────────────────────────────

function nextMondayDate(): Date {
  const today = new Date();
  const day = today.getUTCDay(); // 0=Dom … 6=Sab
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Helper: semana do plano ──────────────────────────────────────────────────

function currentWeekOfPlan(startedAt: string): number {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

// ─── Helper: foco da semana ───────────────────────────────────────────────────

function getFocusForWeek(priorities: WeeklyPriority[], week: number): string {
  for (const p of priorities) {
    const range = p.week_range.trim();
    if (range.includes("-")) {
      const [from, to] = range.split("-").map(Number);
      if (week >= from && week <= to) return p.focus;
    } else if (parseInt(range, 10) === week) {
      return p.focus;
    }
  }
  // fallback: último foco
  return priorities[priorities.length - 1]?.focus ?? "Gerar ideias de conteúdo variadas";
}

// ─── Helper: cleanup de JSON ──────────────────────────────────────────────────

function extractJson(raw: string): string {
  // Remove cercas markdown ```json ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch) return fenceMatch[1].trim();

  // Extrai entre primeira { e última }
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }

  // Fallback: retorna tudo a partir do primeiro {
  if (start !== -1) {
    return raw.slice(start);
  }

  return raw.trim();
}

// ─── Chamada Gemini ───────────────────────────────────────────────────────────

async function callGemini(
  prompt: string,
  apiKey: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const inputTokens  = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  return { text, inputTokens, outputTokens };
}

// ─── Chamada Anthropic ────────────────────────────────────────────────────────

async function callAnthropic(
  prompt: string,
  apiKey: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const inputTokens  = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

// ─── Montar prompt ────────────────────────────────────────────────────────────

function buildPrompt(
  brand: BrandRow,
  plan: BrandPlanRow,
  currentWeek: number,
  weekFocus: string,
  nextMonday: string
): string {
  const pillarsList = brand.pillars
    .map((p) => `- ${p.name} (${p.id}): ${p.description}`)
    .join("\n");

  const forbidden = brand.forbidden_topics.slice(0, 4).join(", ");
  // Truncar tom e persona para não explodir o contexto
  const tone     = (brand.tone ?? "técnico-acessível").slice(0, 300);
  const persona  = (brand.target_persona ?? "produtor rural médio porte").slice(0, 300);

  return `Você é o Agente 1 Estrategista do Publik, sistema de automação de marketing para SaaS de agronegócio.

# BRAND: ${brand.name}
- Nicho: ${brand.niche ?? "SaaS agro"}
- Tom: ${tone}
- Persona: ${persona}

# PLANO BASE
- Objetivo principal: ${plan.goal_primary}
- Métrica: ${plan.goal_metric} (atual: ${plan.goal_current_value}/${plan.goal_target_value})
- Fase atual: ${plan.current_phase}
- Bloqueador atual: ${plan.current_blocker ?? "nenhum identificado"}
- Oferta principal: ${plan.main_offer ?? ""}
- CTA principal: ${plan.main_cta ?? ""}

# SEMANA ATUAL DO PLANO: ${currentWeek}
Foco desta semana: ${weekFocus}

# PILARES DE CONTEÚDO
${pillarsList}

# TÓPICOS PROIBIDOS
${forbidden}

# TAREFA
Gere exatamente 7 ideias de conteúdo para a semana que começa em ${nextMonday}.
Distribua pelos pilares conforme os pesos indicados (aproximado).
Varie os formatos: priorize carrossel e reel, mas inclua pelo menos 1 post e 1 story.
Cada ideia deve ser acionável, específica e alinhada ao bloqueador atual e foco da semana.

Retorne APENAS um JSON válido neste formato (sem texto extra, sem markdown):
{
  "ideas": [
    {
      "angle": "ângulo único da ideia — o ponto de vista específico",
      "topic": "título descritivo do conteúdo (1-2 frases)",
      "hook": "primeira frase/frase de abertura que para o scroll",
      "detail": "desenvolvimento da ideia — o que mostrar, dados, narrativa",
      "cta": "call to action específico para este conteúdo",
      "format": "carrossel|reel|story|blog|email|post",
      "pillar": "id do pilar (prejuizo|operador|diagnostico|case|provocacao)",
      "rationale": "por que esta ideia agora — conexão com fase/bloqueador",
      "contributes_to": "como contribui para a meta principal"
    }
  ]
}`;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Autenticação
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Variáveis de ambiente
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey    = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const llmProvider  = Deno.env.get("LLM_PROVIDER") ?? "gemini";

  if (llmProvider === "gemini" && !geminiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (llmProvider === "anthropic" && !anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Parse body opcional
  let requestBrandId: string | null = null;
  try {
    const body = await req.json() as { brand_id?: string | null };
    requestBrandId = body.brand_id ?? null;
  } catch {
    // body vazio ou não-JSON — tudo bem
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Buscar brands ativas com plano ativo
  let brandsQuery = supabase
    .from("brands")
    .select("id, name, niche, tone, target_persona, pillars, forbidden_topics")
    .eq("is_active", true);

  if (requestBrandId) {
    brandsQuery = brandsQuery.eq("id", requestBrandId);
  }

  const { data: brands, error: brandsError } = await brandsQuery;

  if (brandsError) {
    return new Response(JSON.stringify({ error: brandsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const results: Array<{
    brand_id: string;
    brand_name: string;
    status: string;
    ideas_count?: number;
    error?: string;
    run_id?: string;
  }> = [];

  for (const brand of (brands ?? []) as BrandRow[]) {
    // Buscar plano ativo
    const { data: plans } = await supabase
      .from("brand_plans")
      .select("*")
      .eq("brand_id", brand.id)
      .eq("is_active", true)
      .limit(1);

    if (!plans || plans.length === 0) {
      results.push({
        brand_id: brand.id,
        brand_name: brand.name,
        status: "skipped",
        error: "Sem plano ativo",
      });
      continue;
    }

    const plan = plans[0] as BrandPlanRow;
    const currentWeek = currentWeekOfPlan(plan.started_at);
    const weekFocus   = getFocusForWeek(plan.weekly_priorities, currentWeek);
    const monday      = nextMondayDate();
    const nextMonday  = toIsoDate(monday);
    const weekOf      = nextMonday;

    // Criar agent_run com status running
    const { data: runData } = await supabase
      .from("agent_runs")
      .insert({
        agent_name: "agent_1_estrategista",
        brand_id:   brand.id,
        user_id:    plan.user_id,
        status:     "running",
        llm_provider: llmProvider,
        llm_model:  llmProvider === "gemini" ? "gemini-2.5-flash" : "claude-haiku-4-5-20251001",
        input_payload: {
          brand_id:     brand.id,
          plan_id:      plan.id,
          current_week: currentWeek,
          week_focus:   weekFocus,
          next_monday:  nextMonday,
        },
      })
      .select("id")
      .single();

    const runId = (runData as { id: string } | null)?.id;
    const startedAt = Date.now();

    const prompt = buildPrompt(brand, plan, currentWeek, weekFocus, nextMonday);

    let rawText    = "";
    let inputTok   = 0;
    let outputTok  = 0;
    let llmModel   = "";
    let costUsd    = 0;

    try {
      if (llmProvider === "anthropic" && anthropicKey) {
        const retryResult = await withRetry(() => callAnthropic(prompt, anthropicKey!), {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 4,
        });
        if (runId) {
          await supabase.from("agent_runs")
            .update({ input_payload: { brand_id: brand.id, plan_id: plan.id, current_week: currentWeek, week_focus: weekFocus, next_monday: nextMonday, attempts: retryResult.attempts } })
            .eq("id", runId);
        }
        if (!retryResult.success || !retryResult.data) {
          throw new Error(retryResult.final_error ?? "LLM falhou após retries");
        }
        const r = retryResult.data;
        rawText   = r.text;
        inputTok  = r.inputTokens;
        outputTok = r.outputTokens;
        llmModel  = "claude-haiku-4-5-20251001";
        costUsd   = inputTok * HAIKU_PRICING.input + outputTok * HAIKU_PRICING.output;
      } else {
        const retryResult = await withRetry(() => callGemini(prompt, geminiKey!), {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 4,
        });
        if (runId) {
          await supabase.from("agent_runs")
            .update({ input_payload: { brand_id: brand.id, plan_id: plan.id, current_week: currentWeek, week_focus: weekFocus, next_monday: nextMonday, attempts: retryResult.attempts } })
            .eq("id", runId);
        }
        if (!retryResult.success || !retryResult.data) {
          throw new Error(retryResult.final_error ?? "LLM falhou após retries");
        }
        const r = retryResult.data;
        rawText   = r.text;
        inputTok  = r.inputTokens;
        outputTok = r.outputTokens;
        llmModel  = "gemini-2.5-flash";
        costUsd   = inputTok * GEMINI_PRICING.input + outputTok * GEMINI_PRICING.output;
      }

      // Parse JSON
      const cleaned = extractJson(rawText);
      const parsed  = JSON.parse(cleaned) as LlmResponse;

      if (!Array.isArray(parsed.ideas) || parsed.ideas.length !== 7) {
        throw new Error(
          `LLM retornou ${parsed.ideas?.length ?? 0} ideias, esperado 7`
        );
      }

      // Distribuir seg-dom
      const ideaInserts: ContentIdeaInsert[] = parsed.ideas.map((idea, i) => {
        const day = new Date(monday);
        day.setUTCDate(monday.getUTCDate() + i); // 0=seg … 6=dom
        const scheduledFor = toIsoDate(day);

        const format = VALID_FORMATS.includes(idea.format as typeof VALID_FORMATS[number])
          ? idea.format
          : "post";

        return {
          brand_id:      brand.id,
          user_id:       plan.user_id,
          plan_id:       plan.id,
          angle:         idea.angle ?? "",
          topic:         idea.topic ?? "",
          hook:          idea.hook ?? "",
          detail:        idea.detail ?? "",
          cta:           idea.cta ?? "",
          format,
          pillar:        idea.pillar ?? "",
          rationale:     idea.rationale ?? "",
          contributes_to: idea.contributes_to ?? "",
          scheduled_for: scheduledFor,
          week_of:       weekOf,
          status:        "pending",
          generated_by:  "agent_1_estrategista",
          llm_model:     llmModel,
          llm_cost_usd:  parseFloat((costUsd / 7).toFixed(6)),
        };
      });

      await supabase.from("content_ideas").insert(ideaInserts);

      const durationMs = Date.now() - startedAt;

      if (runId) {
        await supabase
          .from("agent_runs")
          .update({
            status:         "success",
            input_tokens:   inputTok,
            output_tokens:  outputTok,
            cost_usd:       parseFloat(costUsd.toFixed(6)),
            duration_ms:    durationMs,
            finished_at:    new Date().toISOString(),
            output_payload: { ideas_count: 7, week_of: weekOf },
          })
          .eq("id", runId);
      }

      results.push({
        brand_id:    brand.id,
        brand_name:  brand.name,
        status:      "success",
        ideas_count: 7,
        run_id:      runId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startedAt;

      if (runId) {
        await supabase
          .from("agent_runs")
          .update({
            status:        "failed",
            error_message: message,
            input_tokens:  inputTok,
            output_tokens: outputTok,
            duration_ms:   durationMs,
            finished_at:   new Date().toISOString(),
          })
          .eq("id", runId);
      }

      results.push({
        brand_id:   brand.id,
        brand_name: brand.name,
        status:     "failed",
        error:      message,
        run_id:     runId,
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
