import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFeed } from "https://esm.sh/htmlparser2@9.1.0";

interface RadarSource {
  id: string;
  brand_id: string;
  source_type: string;
  source_url: string;
  source_name?: string;
}

interface RSSItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  content?: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const xml = await response.text();
    const feed = parseFeed(xml);

    return (feed?.items || []).slice(0, 10).map((item: any) => ({
      title: item.title || "",
      description: item.description || item.summary || "",
      link: item.link || "",
      pubDate: item.pubDate || new Date().toISOString(),
      content: item.content || "",
    }));
  } catch (err) {
    console.error(`Error fetching RSS ${url}:`, err);
    return [];
  }
}

async function analyzeOpportunity(
  title: string,
  description: string,
  brandName: string,
  model: string,
  temperature: number
): Promise<{
  relevance_score: number;
  suggested_angle: string;
  suggested_format: string;
  urgency: string;
}> {
  try {
    const prompt = `
Analise esta notícia/oportunidade para a brand "${brandName}".

Título: ${title}
Descrição: ${description}

Responda em JSON com:
- relevance_score (0-1): quão relevante é para a brand
- suggested_angle (texto): ângulo de abordagem para conteúdo
- suggested_format (reel|carrossel|post|blog): formato recomendado
- urgency (low|normal|high|trending): urgência

Exemplo:
{"relevance_score": 0.8, "suggested_angle": "...", "suggested_format": "reel", "urgency": "high"}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 1024,
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const text: string =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      relevance_score: Math.min(Math.max(parsed.relevance_score || 0, 0), 1),
      suggested_angle: parsed.suggested_angle || "",
      suggested_format: parsed.suggested_format || "post",
      urgency: parsed.urgency || "normal",
    };
  } catch (err) {
    console.error("Error analyzing opportunity:", err);
    return {
      relevance_score: 0,
      suggested_angle: "",
      suggested_format: "post",
      urgency: "normal",
    };
  }
}

async function scanBrandSources(
  accountId: string,
  brandId: string,
  brandName: string,
  minScore: number,
  model: string,
  temperature: number
) {
  // Buscar sources dessa brand
  const { data: sources, error: sourcesError } = await supabase
    .from("opportunity_sources")
    .select("*")
    .eq("brand_id", brandId)
    .eq("active", true);

  if (sourcesError || !sources) {
    console.error("Error fetching sources:", sourcesError);
    return;
  }

  // Processar cada source
  for (const source of sources) {
    console.log(`Scanning ${source.source_name || source.source_type}...`);

    let items: RSSItem[] = [];

    if (source.source_type === "rss") {
      items = await fetchRSSFeed(source.source_url);
    } else if (source.source_type === "google_news") {
      // Google News RSS template
      const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        brandName
      )}&hl=pt-BR&gl=BR&ceid=BR:pt`;
      items = await fetchRSSFeed(newsUrl);
    }
    // Twitter, G1, Reddit would need specific APIs (não implementado aqui)

    // Analisar cada item
    for (const item of items) {
      if (!item.title || !item.description) continue;

      // Verificar duplicatas (mesma URL ou mesmo título exato)
      let dupQuery = supabase
        .from("opportunities")
        .select("id")
        .eq("brand_id", brandId);
      dupQuery = item.link
        ? dupQuery.eq("url", item.link)
        : dupQuery.eq("title", item.title);
      const { data: existing } = await dupQuery.limit(1);

      if (existing && existing.length > 0) {
        console.log(`Skipping duplicate: ${item.title.slice(0, 50)}`);
        continue;
      }

      // Analisar com Gemini
      const analysis = await analyzeOpportunity(
        item.title,
        item.description,
        brandName,
        model,
        temperature
      );

      // Se score >= min, inserir
      if (analysis.relevance_score >= minScore) {
        const { error: insertError } = await supabase
          .from("opportunities")
          .insert({
            account_id: accountId,
            brand_id: brandId,
            source_id: source.id,
            title: item.title,
            description: item.description,
            url: item.link,
            relevance_score: analysis.relevance_score,
            suggested_angle: analysis.suggested_angle,
            suggested_format: analysis.suggested_format,
            urgency: analysis.urgency,
            status: "pending",
            source_content: {
              raw_title: item.title,
              raw_description: item.description,
              published_at: item.pubDate,
            },
            created_by_scan_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Error inserting opportunity:", insertError);
        } else {
          console.log(
            `✓ Opportunity added: ${item.title.slice(0, 50)} (score: ${(
              analysis.relevance_score * 100
            ).toFixed(0)}%)`
          );
        }
      }
    }

    // Rate limit: aguardar 1s entre sources
    await new Promise((r) => setTimeout(r, 1000));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { account_id } = await req.json().catch(() => ({}));

    // Se não fornecido, rodar para TODAS as contas
    let accountIds: string[];
    if (account_id) {
      accountIds = [account_id];
    } else {
      const { data: configs } = await supabase
        .from("radar_configs")
        .select("account_id")
        .eq("enabled", true);
      accountIds = configs?.map((c: { account_id: string }) => c.account_id) ?? [];
    }

    console.log(`Starting radar scan for ${accountIds.length} accounts...`);

    for (const accId of accountIds) {
      // Buscar config
      const { data: config, error: configError } = await supabase
        .from("radar_configs")
        .select("*")
        .eq("account_id", accId)
        .single();

      if (configError || !config) {
        console.warn(`No config for account ${accId}`);
        continue;
      }

      // Buscar brands
      const { data: brands, error: brandsError } = await supabase
        .from("brands")
        .select("id, name")
        .eq("account_id", accId);

      if (brandsError || !brands) {
        console.warn(`No brands for account ${accId}`);
        continue;
      }

      // Processar cada brand
      for (const brand of brands) {
        await scanBrandSources(
          accId,
          brand.id,
          brand.name,
          config.min_relevance_score,
          "gemini-2.5-flash",
          0.7
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Radar scan completed for ${accountIds.length} accounts`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Radar scan error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
});
