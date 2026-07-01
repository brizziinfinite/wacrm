import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTIZ_URL = "https://postiz.br11.com.br";
const POSTIZ_API_KEY = Deno.env.get("POSTIZ")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function publishViaPostiz(
  postizIntegrationId: string,
  platform: string,
  content: string,
  scheduledAt: string
): Promise<void> {
  const body = {
    type: "schedule",
    date: scheduledAt,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: postizIntegrationId },
        value: [{ content, image: [] }],
        settings: { __type: platform.toLowerCase() },
      },
    ],
  };

  const res = await fetch(`${POSTIZ_URL}/api/public/v1/posts`, {
    method: "POST",
    headers: {
      Authorization: POSTIZ_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Postiz ${res.status}: ${err}`);
  }
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();

  const { data: posts, error: fetchError } = await supabase
    .from("posts")
    .select("id, brand_id, content, platform, scheduled_at, social_account_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!posts || posts.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum post para publicar", count: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; status: "published" | "failed"; error?: string }> = [];

  for (const post of posts) {
    try {
      // Usa social_account_id direto se disponível, senão fallback por brand+platform
      let postizId: string | null = null;
      if (post.social_account_id) {
        const { data: acc } = await supabase
          .from("social_accounts")
          .select("postiz_integration_id")
          .eq("id", post.social_account_id)
          .maybeSingle();
        postizId = acc?.postiz_integration_id ?? null;
      } else {
        const { data: acc } = await supabase
          .from("social_accounts")
          .select("postiz_integration_id")
          .eq("brand_id", post.brand_id)
          .eq("platform", post.platform)
          .eq("is_active", true)
          .not("postiz_integration_id", "is", null)
          .maybeSingle();
        postizId = acc?.postiz_integration_id ?? null;
      }

      const account = { postiz_integration_id: postizId };

      if (!account?.postiz_integration_id) {
        console.warn(`Post ${post.id}: sem canal Postiz para ${post.platform}`);
        await supabase
          .from("posts")
          .update({ status: "failed", updated_at: now })
          .eq("id", post.id);
        results.push({ id: post.id, status: "failed", error: "Sem canal Postiz conectado" });
        continue;
      }

      await publishViaPostiz(
        account.postiz_integration_id,
        post.platform ?? "instagram",
        post.content ?? "",
        post.scheduled_at ?? now
      );

      await supabase
        .from("posts")
        .update({ status: "published", published_at: now, updated_at: now })
        .eq("id", post.id);

      results.push({ id: post.id, status: "published" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`Erro ao publicar post ${post.id}:`, msg);

      await supabase
        .from("posts")
        .update({ status: "failed", updated_at: now })
        .eq("id", post.id);

      results.push({ id: post.id, status: "failed", error: msg });
    }
  }

  const published = results.filter((r) => r.status === "published").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return new Response(
    JSON.stringify({ published, failed, results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
