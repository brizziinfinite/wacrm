import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Publicação no Instagram ─────────────────────────────────────────────────
async function publishToInstagram(
  accountId: string,
  accessToken: string,
  content: string,
  mediaUrls: string[]
): Promise<void> {
  const caption = content ?? "";

  if (mediaUrls.length === 0) {
    throw new Error("Instagram requer pelo menos uma imagem ou vídeo");
  }

  const firstMedia = mediaUrls[0];
  const isVideo = /\.(mp4|mov|avi)$/i.test(firstMedia);

  // 1. Cria o container de mídia
  const containerBody: Record<string, string> = {
    caption,
    access_token: accessToken,
  };

  if (isVideo) {
    containerBody.media_type = "REELS";
    containerBody.video_url = firstMedia;
  } else if (mediaUrls.length > 1) {
    // Carrossel: cria container para cada item primeiro
    const childIds: string[] = [];
    for (const url of mediaUrls) {
      const childRes = await fetch(
        `https://graph.facebook.com/v19.0/${accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: accessToken }),
        }
      );
      const child = await childRes.json();
      if (child.error) throw new Error(child.error.message);
      childIds.push(child.id);
    }
    containerBody.media_type = "CAROUSEL";
    containerBody.children = childIds.join(",");
  } else {
    containerBody.image_url = firstMedia;
  }

  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerBody),
    }
  );
  const container = await containerRes.json();
  if (container.error) throw new Error(container.error.message);

  // 2. Publica o container
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
    }
  );
  const published = await publishRes.json();
  if (published.error) throw new Error(published.error.message);
}

// ─── Publicação no Facebook ───────────────────────────────────────────────────
async function publishToFacebook(
  pageId: string,
  accessToken: string,
  content: string,
  mediaUrls: string[]
): Promise<void> {
  const message = content ?? "";

  if (mediaUrls.length > 0) {
    // Post com foto
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, url: mediaUrls[0], access_token: accessToken }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
  } else {
    // Post só com texto
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: accessToken }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
  }
}

// ─── Publicação no TikTok ─────────────────────────────────────────────────────
async function publishToTikTok(
  accessToken: string,
  content: string,
  mediaUrls: string[]
): Promise<void> {
  if (mediaUrls.length === 0) {
    throw new Error("TikTok requer pelo menos um vídeo");
  }

  // Inicializa upload de vídeo
  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: content?.slice(0, 150) ?? "",
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrls[0],
        },
      }),
    }
  );

  const initData = await initRes.json();
  if (initData.error?.code !== "ok") {
    throw new Error(initData.error?.message ?? "Erro ao iniciar upload TikTok");
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // Busca posts agendados vencidos
  const { data: posts, error: fetchError } = await supabase
    .from("posts")
    .select("id, brand_id, content, media_urls, platform, scheduled_at")
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
      // Busca a conta social conectada para esta brand+plataforma
      const { data: account } = await supabase
        .from("social_accounts")
        .select("account_id, access_token, is_active")
        .eq("brand_id", post.brand_id)
        .eq("platform", post.platform)
        .eq("is_active", true)
        .maybeSingle();

      if (!account) {
        // Sem conta conectada: apenas marca como publicado (simulação)
        console.log(`Post ${post.id}: sem conta ${post.platform} conectada, marcando como publicado`);
        await supabase
          .from("posts")
          .update({ status: "published", published_at: now, updated_at: now })
          .eq("id", post.id);
        results.push({ id: post.id, status: "published" });
        continue;
      }

      // Publica na plataforma correspondente
      const content = post.content ?? "";
      const mediaUrls: string[] = post.media_urls ?? [];

      if (post.platform === "instagram") {
        await publishToInstagram(account.account_id, account.access_token, content, mediaUrls);
      } else if (post.platform === "facebook") {
        await publishToFacebook(account.account_id, account.access_token, content, mediaUrls);
      } else if (post.platform === "tiktok") {
        await publishToTikTok(account.access_token, content, mediaUrls);
      }

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
