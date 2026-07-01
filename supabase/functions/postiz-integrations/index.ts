import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTIZ_URL = "https://postiz.br11.com.br";
const POSTIZ_API_KEY = Deno.env.get("POSTIZ")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) return json({ error: "Não autorizado" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const brandId = url.searchParams.get("brand_id");

  // GET /postiz-integrations?action=list&brand_id=xxx — lista canais conectados
  if (req.method === "GET" && action === "list") {
    if (!brandId) return json({ error: "brand_id obrigatório" }, 400);

    const { data: accounts, error } = await supabase
      .from("social_accounts")
      .select("id, platform, account_name, account_avatar, is_active, postiz_integration_id, postiz_username")
      .eq("brand_id", brandId)
      .not("postiz_integration_id", "is", null);

    if (error) return json({ error: error.message }, 500);
    return json({ accounts: accounts ?? [] });
  }

  // GET /postiz-integrations?action=available — lista integrações disponíveis no Postiz
  if (req.method === "GET" && action === "available") {
    const res = await fetch(`${POSTIZ_URL}/api/public/v1/integrations`, {
      headers: { Authorization: POSTIZ_API_KEY },
    });
    if (!res.ok) return json({ error: "Erro ao buscar integrações do Postiz" }, 502);
    const data = await res.json();
    return json({ integrations: data });
  }

  // POST /postiz-integrations — conecta canal: salva postiz_integration_id em social_accounts
  if (req.method === "POST") {
    const body = await req.json();
    const { brand_id, postiz_integration_id, platform, account_name, account_avatar } = body;

    if (!brand_id || !postiz_integration_id || !platform) {
      return json({ error: "brand_id, postiz_integration_id e platform são obrigatórios" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return json({ error: "Perfil não encontrado" }, 400);

    const { data: existing } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("brand_id", brand_id)
      .eq("postiz_integration_id", postiz_integration_id)
      .maybeSingle();

    if (existing) return json({ error: "Canal já conectado" }, 409);

    const { error } = await supabase.from("social_accounts").insert({
      user_id: user.id,
      tenant_id: profile.account_id,
      brand_id,
      platform,
      account_id: postiz_integration_id,
      account_name: account_name ?? platform,
      account_avatar: account_avatar ?? null,
      access_token: "postiz",
      is_active: true,
      postiz_integration_id,
      postiz_username: account_name ?? null,
    });

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // DELETE /postiz-integrations?id=xxx — desconecta canal
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id obrigatório" }, 400);

    const { error } = await supabase
      .from("social_accounts")
      .delete()
      .eq("id", id);

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Método não suportado" }, 405);
});
