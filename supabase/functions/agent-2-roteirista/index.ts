import { createClient } from "jsr:@supabase/supabase-js@2";
import { withRetry } from "../_shared/llm-retry.ts";

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type IdeaFormat = "carrossel" | "reel" | "story" | "blog" | "email" | "post";

interface IdeaRow {
  id: string;
  brand_id: string;
  user_id: string;
  plan_id: string | null;
  angle: string;
  topic: string;
  hook: string | null;
  detail: string | null;
  cta: string | null;
  format: IdeaFormat;
  pillar: string | null;
  rationale: string | null;
  contributes_to: string | null;
  scheduled_for: string | null;
  status: string;
  package_id: string | null;
}

interface BrandRow {
  id: string;
  name: string;
  niche: string | null;
  tone: string | null;
  target_persona: string | null;
  pillars: unknown[];
  forbidden_topics: string[];
}

interface PlanRow {
  id: string;
  goal_primary: string;
  goal_metric: string;
  goal_target_value: number;
  goal_current_value: number;
  current_phase: string;
  current_blocker: string | null;
  main_offer: string | null;
  main_cta: string | null;
  pricing: Record<string, unknown>;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

const GEMINI_PRICING = { input: 0.30 / 1_000_000, output: 2.50 / 1_000_000 };
const HAIKU_PRICING  = { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 };

// ─── JSON cleanup ─────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  if (start !== -1) return raw.slice(start);
  return raw.trim();
}

// ─── LLM calls ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    text:         data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    inputTokens:  data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callAnthropic(prompt: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text:         data.content?.find((c) => c.type === "text")?.text ?? "",
    inputTokens:  data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ─── Contexto base (reutilizado em todos os prompts) ─────────────────────────

function baseContext(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  const tone    = (brand.tone ?? "técnico-acessível").slice(0, 400);
  const persona = (brand.target_persona ?? "produtor rural médio porte").slice(0, 300);
  const anchorPhrases = (plan.pricing as { anchor_phrases?: string[] }).anchor_phrases ?? [];

  return `# BRAND: ${brand.name}
- Nicho: ${brand.niche ?? "SaaS agro"}
- Tom: ${tone}
- Persona: ${persona}
- Tópicos proibidos: ${brand.forbidden_topics.slice(0, 4).join(", ")}

# PLANO BASE
- Objetivo: ${plan.goal_primary}
- Fase: ${plan.current_phase}
- Bloqueador: ${plan.current_blocker ?? "nenhum"}
- Oferta: ${plan.main_offer ?? ""}
- CTA global: ${plan.main_cta ?? ""}
- Frases âncora de preço: ${anchorPhrases.slice(0, 2).join(" | ")}

# IDEIA A EXPANDIR
- Ângulo: ${idea.angle}
- Tópico: ${idea.topic}
- Hook: ${idea.hook ?? ""}
- Detalhe: ${idea.detail ?? ""}
- CTA da ideia: ${idea.cta ?? ""}
- Contribui para: ${idea.contributes_to ?? ""}
- Pilar: ${idea.pillar ?? ""}`;
}

// ─── Prompts por formato ──────────────────────────────────────────────────────

function promptCarrossel(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar carrossel Instagram de 6-8 slides

REGRAS OBRIGATÓRIAS:
- Slide 1 = HOOK. Mesma força do hook da ideia. Não use título genérico.
- Slide 2 = problema/consequência concreto com número real se possível
- Slides 3-6 = desenvolvimento (dicas, lista, argumentos)
- Slide penúltimo = quebra de objeção ou prova social
- Slide final = CTA + frase âncora de preço do plano
- title: máximo 8 palavras, sem "..." ou "?" no final
- body: máximo 25 palavras, 1-2 frases curtas
- Tom do texto = mesmo tom da brand (técnico-acessível, sem hype)
- image_prompt: descrição visual em PT, 1 frase, sem citar marcas

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "carousel_slides": [
    {
      "slide": 1,
      "title": "texto do título",
      "body": "texto do corpo",
      "image_prompt": "descrição visual",
      "layout_hint": "text_only"
    }
  ],
  "visual_prompt": "prompt de estilo visual para o carrossel inteiro",
  "estimated_post_length": 850
}

layout_hint valores possíveis: "text_only" | "image_left" | "image_right" | "fullscreen_image" | "split"`;
}

function promptReel(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar roteiro de Reel Instagram de 15-30 segundos

REGRAS OBRIGATÓRIAS:
- hook_3s: máximo 5 palavras, deve parar o scroll imediatamente
- 3-5 cenas, cada uma 4-8 segundos
- voiceover: PT-BR informal (gíria de roça permitida com parcimônia)
- onscreen_text: máximo 6 palavras por cena
- visual_description: o que aparece na tela, sem citar marca/IP, em PT
- cta_final: deve mencionar trial 14 dias
- music_mood: descreve estilo musical sugerido

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "reel_script": {
    "duration_seconds": 25,
    "hook_3s": "texto do hook",
    "scenes": [
      {
        "scene": 1,
        "voiceover": "texto do voiceover",
        "onscreen_text": "texto na tela",
        "visual_description": "o que aparece",
        "duration_s": 5
      }
    ],
    "cta_final": "Teste 14 dias grátis — irrigaagro.com.br/trial",
    "music_mood": "urgente_rural"
  },
  "visual_prompt": "estilo visual do reel inteiro",
  "estimated_post_length": 0
}`;
}

function promptStory(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar sequência de 3-5 Stories Instagram

REGRAS OBRIGATÓRIAS:
- Frame 1 = pergunta direta ou número chocante (para o scroll)
- Pode incluir elemento interativo: enquete, slider, quiz, caixa de pergunta
- Frame final sempre CTA (link na bio ou DM)
- text: máximo 15 palavras por frame
- visual_description: o que aparece no fundo/imagem

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "story_frames": [
    {
      "frame": 1,
      "text": "texto do frame",
      "visual_description": "fundo/imagem",
      "interactive_element": {"type": "poll", "options": ["Sim","Não"]}
    }
  ],
  "visual_prompt": "estilo visual geral da série de stories",
  "estimated_post_length": 0
}

interactive_element.type: "poll" | "slider" | "quiz" | "question" | null
Para frames sem interativo, use: "interactive_element": null`;
}

function promptBlog(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar post de blog completo (800-1500 palavras)

REGRAS OBRIGATÓRIAS:
- title: otimizado pra busca, incluir keywords como "pivô central", "monitoramento de irrigação"
- slug: kebab-case, sem acentos
- meta_description: 140-160 caracteres
- intro: 80-150 palavras, com pergunta retórica
- 3-5 seções com H2
- Cada seção: 150-300 palavras
- conclusion: puxa pra CTA
- internal_cta: texto do botão/link final
- Tom = mesmo da brand (sem hype, técnico-acessível, sem palavras proibidas)

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "blog_content": {
    "title": "título otimizado",
    "slug": "slug-em-kebab-case",
    "meta_description": "descrição de 140-160 chars",
    "intro": "parágrafo de introdução",
    "sections": [
      {"h2": "título da seção", "body": "corpo da seção"}
    ],
    "conclusion": "parágrafo de conclusão",
    "internal_cta": "Teste 14 dias grátis →"
  },
  "visual_prompt": "descrição da imagem de capa do blog",
  "estimated_post_length": 1100
}`;
}

function promptEmail(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar email marketing completo

REGRAS OBRIGATÓRIAS:
- subject: 30-50 caracteres, sem clickbait
- preview_text: 50-80 caracteres, complemento do subject
- greeting: informal ("Fala, [Nome]" ou similar)
- body_html: HTML simples (<p>, <strong>, <a>), 200-400 palavras
- ps: curto e forte (PS é a parte mais lida)
- cta_url_placeholder: sempre usar a string exata {{TRIAL_URL}}
- Tom = mesmo da brand

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "email_content": {
    "subject": "assunto do email",
    "preview_text": "preview do email",
    "greeting": "Fala, [Nome],",
    "body_html": "<p>corpo em HTML</p>",
    "ps": "PS: frase forte",
    "cta_url_placeholder": "{{TRIAL_URL}}"
  },
  "visual_prompt": null,
  "estimated_post_length": 350
}`;
}

function promptPost(brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  return `${baseContext(brand, plan, idea)}

# TAREFA: Criar caption de post Instagram

REGRAS OBRIGATÓRIAS:
- Caption: 100-300 palavras
- Parágrafos curtos (1-3 linhas), separados por linha em branco
- Primeira linha = hook forte (mesma força do hook da ideia)
- Hashtags: 5-10, mix de volume alto (#agronegocio) + nicho (#pivocentral #irrigacao)
- alt_text: descritivo, acessível, sem marketing
- first_comment: CTA com link (regra IG: link fora da caption)
- Tom = mesmo da brand

Retorne APENAS JSON válido (sem texto extra, sem markdown):
{
  "post_content": {
    "caption": "texto completo da caption com quebras de linha",
    "alt_text": "descrição acessível da imagem",
    "hashtags": ["#pivocentral", "#agronegocio"],
    "first_comment": "CTA com link"
  },
  "visual_prompt": "descrição da imagem principal do post",
  "estimated_post_length": 220
}`;
}

function buildPrompt(format: IdeaFormat, brand: BrandRow, plan: PlanRow, idea: IdeaRow): string {
  switch (format) {
    case "carrossel": return promptCarrossel(brand, plan, idea);
    case "reel":      return promptReel(brand, plan, idea);
    case "story":     return promptStory(brand, plan, idea);
    case "blog":      return promptBlog(brand, plan, idea);
    case "email":     return promptEmail(brand, plan, idea);
    case "post":      return promptPost(brand, plan, idea);
  }
}

// ─── Validação do output por formato ─────────────────────────────────────────

function validateOutput(format: IdeaFormat, parsed: Record<string, unknown>): string | null {
  switch (format) {
    case "carrossel":
      if (!Array.isArray(parsed.carousel_slides) || parsed.carousel_slides.length < 4)
        return "carousel_slides deve ter pelo menos 4 slides";
      return null;
    case "reel":
      if (!parsed.reel_script || typeof parsed.reel_script !== "object")
        return "reel_script ausente";
      return null;
    case "story":
      if (!Array.isArray(parsed.story_frames) || parsed.story_frames.length < 3)
        return "story_frames deve ter pelo menos 3 frames";
      return null;
    case "blog":
      if (!parsed.blog_content || typeof parsed.blog_content !== "object")
        return "blog_content ausente";
      return null;
    case "email":
      if (!parsed.email_content || typeof parsed.email_content !== "object")
        return "email_content ausente";
      return null;
    case "post":
      if (!parsed.post_content || typeof parsed.post_content !== "object")
        return "post_content ausente";
      return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey   = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const llmProvider  = Deno.env.get("LLM_PROVIDER") ?? "gemini";

  if (llmProvider === "gemini" && !geminiKey)
    return json({ error: "GEMINI_API_KEY não configurada" }, 500);
  if (llmProvider === "anthropic" && !anthropicKey)
    return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

  // Parse body
  let ideaId: string | null = null;
  try {
    const body = await req.json() as { idea_id?: string };
    ideaId = body.idea_id ?? null;
  } catch { /* body vazio */ }

  if (!ideaId) return json({ error: "idea_id obrigatório no body" }, 400);

  const supabase = createClient(supabaseUrl, serviceKey);

  // Buscar ideia
  const { data: idea, error: ideaErr } = await supabase
    .from("content_ideas")
    .select("*")
    .eq("id", ideaId)
    .single();

  if (ideaErr || !idea) return json({ error: "Ideia não encontrada" }, 404);
  const i = idea as IdeaRow;

  if (i.status !== "approved") return json({ error: `Ideia não está aprovada (status: ${i.status})` }, 400);

  // Idempotência — verificar se já existe pacote ativo
  const { data: existing } = await supabase
    .from("content_packages")
    .select("id, status")
    .eq("idea_id", ideaId)
    .not("status", "in", '("rejected","failed")')
    .maybeSingle();

  if (existing) return json({ package_id: existing.id, status: existing.status, already_exists: true });

  // Buscar brand
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, name, niche, tone, target_persona, pillars, forbidden_topics")
    .eq("id", i.brand_id)
    .single();

  if (brandErr || !brand) return json({ error: "Brand não encontrada" }, 404);

  // Buscar plano ativo
  const { data: plans } = await supabase
    .from("brand_plans")
    .select("*")
    .eq("brand_id", i.brand_id)
    .eq("is_active", true)
    .limit(1);

  if (!plans || plans.length === 0) return json({ error: "Brand sem plano ativo" }, 400);
  const plan = plans[0] as PlanRow;

  // Criar pacote com status generating
  const { data: pkg, error: pkgErr } = await supabase
    .from("content_packages")
    .insert({
      brand_id:    i.brand_id,
      user_id:     i.user_id,
      idea_id:     ideaId,
      format:      i.format,
      status:      "generating",
      llm_provider: llmProvider,
      llm_model:   llmProvider === "gemini" ? "gemini-2.5-flash" : "claude-haiku-4-5-20251001",
    })
    .select("id")
    .single();

  if (pkgErr || !pkg) return json({ error: "Erro ao criar pacote: " + pkgErr?.message }, 500);
  const packageId = (pkg as { id: string }).id;

  // Criar agent_run
  const { data: runData } = await supabase
    .from("agent_runs")
    .insert({
      agent_name:   "agent_2_roteirista",
      brand_id:     i.brand_id,
      user_id:      i.user_id,
      status:       "running",
      llm_provider: llmProvider,
      llm_model:    llmProvider === "gemini" ? "gemini-2.5-flash" : "claude-haiku-4-5-20251001",
      input_payload: { idea_id: ideaId, format: i.format, package_id: packageId },
    })
    .select("id")
    .single();

  const runId = (runData as { id: string } | null)?.id;
  const startedAt = Date.now();

  try {
    const prompt = buildPrompt(i.format as IdeaFormat, brand as BrandRow, plan, i);

    let rawText = "";
    let inputTok = 0;
    let outputTok = 0;
    let llmModel = "";
    let costUsd = 0;

    if (llmProvider === "anthropic" && anthropicKey) {
      const retryResult = await withRetry(() => callAnthropic(prompt, anthropicKey!), {
        maxAttempts: 3,
        initialDelayMs: 2000,
        backoffMultiplier: 4,
      });
      if (runId) {
        await supabase.from("agent_runs")
          .update({ input_payload: { idea_id: ideaId, format: i.format, package_id: packageId, attempts: retryResult.attempts } })
          .eq("id", runId);
      }
      if (!retryResult.success || !retryResult.data) {
        throw new Error(retryResult.final_error ?? "LLM falhou após retries");
      }
      const r = retryResult.data;
      rawText = r.text; inputTok = r.inputTokens; outputTok = r.outputTokens;
      llmModel = "claude-haiku-4-5-20251001";
      costUsd = inputTok * HAIKU_PRICING.input + outputTok * HAIKU_PRICING.output;
    } else {
      const retryResult = await withRetry(() => callGemini(prompt, geminiKey!), {
        maxAttempts: 3,
        initialDelayMs: 2000,
        backoffMultiplier: 4,
      });
      if (runId) {
        await supabase.from("agent_runs")
          .update({ input_payload: { idea_id: ideaId, format: i.format, package_id: packageId, attempts: retryResult.attempts } })
          .eq("id", runId);
      }
      if (!retryResult.success || !retryResult.data) {
        throw new Error(retryResult.final_error ?? "LLM falhou após retries");
      }
      const r = retryResult.data;
      rawText = r.text; inputTok = r.inputTokens; outputTok = r.outputTokens;
      llmModel = "gemini-2.5-flash";
      costUsd = inputTok * GEMINI_PRICING.input + outputTok * GEMINI_PRICING.output;
    }

    const cleaned = extractJson(rawText);
    const parsed  = JSON.parse(cleaned) as Record<string, unknown>;

    const validationError = validateOutput(i.format as IdeaFormat, parsed);
    if (validationError) throw new Error(validationError);

    // Montar update do pacote com campo correto por formato
    const formatField: Record<IdeaFormat, string> = {
      carrossel: "carousel_slides",
      reel:      "reel_script",
      story:     "story_frames",
      blog:      "blog_content",
      email:     "email_content",
      post:      "post_content",
    };

    const pkgUpdate: Record<string, unknown> = {
      status:                "pending_review",
      llm_model:             llmModel,
      llm_cost_usd:          parseFloat(costUsd.toFixed(6)),
      visual_prompt:         typeof parsed.visual_prompt === "string" ? parsed.visual_prompt : null,
      estimated_post_length: typeof parsed.estimated_post_length === "number" ? parsed.estimated_post_length : 0,
    };
    pkgUpdate[formatField[i.format as IdeaFormat]] = parsed[formatField[i.format as IdeaFormat]];

    await supabase.from("content_packages").update(pkgUpdate).eq("id", packageId);

    // Atualizar ideia
    await supabase
      .from("content_ideas")
      .update({ status: "generated", package_id: packageId })
      .eq("id", ideaId);

    const durationMs = Date.now() - startedAt;

    if (runId) {
      await supabase.from("agent_runs").update({
        status:       "success",
        input_tokens:  inputTok,
        output_tokens: outputTok,
        cost_usd:      parseFloat(costUsd.toFixed(6)),
        duration_ms:   durationMs,
        finished_at:   new Date().toISOString(),
        output_payload: { package_id: packageId, format: i.format },
      }).eq("id", runId);
    }

    return json({ package_id: packageId, format: i.format, status: "pending_review" });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    await supabase.from("content_packages").update({
      status: "failed",
      error_message: message,
    }).eq("id", packageId);

    if (runId) {
      await supabase.from("agent_runs").update({
        status: "failed",
        error_message: message,
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return json({ error: message, package_id: packageId }, 500);
  }
});
