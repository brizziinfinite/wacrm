import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const POSTIZ_URL = "https://postiz.br11.com.br";
const POSTIZ_API_KEY = process.env.POSTIZ!;

// GET /api/auth/postiz/callback?code=xxx&state=brand_id:user_id
// Postiz redireciona aqui após OAuth das redes sociais.
// state = "brand_id|user_id" para sabermos onde salvar.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Fecha popup e repassa resultado para a janela pai
  function closePopup(status: "success" | "error", message?: string) {
    const html = `<!DOCTYPE html><html><body><script>
      window.opener?.postMessage({ type: "postiz-oauth", status: "${status}", message: "${message ?? ""}" }, "*");
      window.close();
    </script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  }

  if (error || !code || !state) {
    return closePopup("error", error ?? "missing_params");
  }

  // state = "brand_id|user_id"
  const [brandId, userId] = state.split("|");
  if (!brandId || !userId) return closePopup("error", "invalid_state");

  try {
    const supabase = await createClient();

    // Busca o perfil para pegar account_id (tenant)
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", userId)
      .single();

    if (!profile) return closePopup("error", "profile_not_found");

    // Busca integrações disponíveis no Postiz (o canal recém-conectado aparece aqui)
    const intRes = await fetch(`${POSTIZ_URL}/api/public/v1/integrations`, {
      headers: { Authorization: POSTIZ_API_KEY },
    });
    if (!intRes.ok) return closePopup("error", "postiz_fetch_failed");

    const integrations: Array<{
      id: string;
      name: string;
      identifier: string;
      picture: string;
      profile: string;
    }> = await intRes.json();

    // Busca canais já salvos para esta brand para não duplicar
    const { data: existing } = await supabase
      .from("social_accounts")
      .select("postiz_integration_id")
      .eq("brand_id", brandId)
      .not("postiz_integration_id", "is", null);

    const existingIds = new Set((existing ?? []).map((e) => e.postiz_integration_id));

    // Salva apenas os que ainda não estão vinculados a esta brand
    const toInsert = integrations.filter((i) => !existingIds.has(i.id));

    if (toInsert.length > 0) {
      await supabase.from("social_accounts").insert(
        toInsert.map((i) => ({
          user_id: userId,
          tenant_id: profile.account_id,
          brand_id: brandId,
          platform: i.identifier,
          account_id: i.id,
          account_name: i.name,
          account_avatar: i.picture ?? null,
          access_token: "postiz",
          is_active: true,
          postiz_integration_id: i.id,
          postiz_username: i.profile ?? i.name,
        }))
      );
    }

    return closePopup("success");
  } catch (err) {
    console.error("Postiz callback error:", err);
    return closePopup("error", "server_error");
  }
}
