"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Plus, Trash2, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "threads", label: "Threads" },
  { id: "bluesky", label: "Bluesky" },
  { id: "pinterest", label: "Pinterest" },
];

const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.label])
);

interface ConnectedChannel {
  id: string;
  platform: string;
  account_name: string | null;
  account_avatar: string | null;
  is_active: boolean;
  postiz_integration_id: string;
}

export default function CanaisPage() {
  const activeBrand = useAppStore((s) => s.activeBrand);
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  const fetchChannels = useCallback(async () => {
    if (!activeBrand?.id) { setChannels([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("social_accounts")
      .select("id, platform, account_name, account_avatar, is_active, postiz_integration_id")
      .eq("brand_id", activeBrand.id)
      .not("postiz_integration_id", "is", null);
    setChannels((data as ConnectedChannel[]) ?? []);
    setLoading(false);
  }, [activeBrand?.id, supabase]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Escuta postMessage do popup OAuth
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "postiz-oauth") return;
      if (e.data.status === "success") {
        toast.success("Canal conectado!");
        fetchChannels();
      } else {
        toast.error("Erro ao conectar: " + (e.data.message ?? "desconhecido"));
      }
      setConnecting(null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchChannels]);

  async function handleConnect(platform: string) {
    if (!activeBrand?.id || !userId) return;
    setConnecting(platform);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/postiz-integrations?action=oauth_url&platform=${platform}&brand_id=${activeBrand.id}&user_id=${userId}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      const json = await res.json();
      if (!json.url) {
        toast.error("Plataforma não suporta OAuth direto. Configure manualmente no Postiz.");
        setConnecting(null);
        return;
      }

      // Abre popup OAuth
      const w = 600, h = 700;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        json.url,
        "postiz-oauth",
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
      );

      // Fallback: se popup fechar sem postMessage (usuário fechou manualmente)
      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          setConnecting(null);
          fetchChannels(); // tenta de qualquer forma
        }
      }, 1000);
    } catch {
      toast.error("Erro ao iniciar conexão");
      setConnecting(null);
    }
  }

  async function handleDisconnect(channelId: string) {
    setDisconnecting(channelId);
    const { error } = await supabase.from("social_accounts").delete().eq("id", channelId);
    if (error) toast.error("Erro ao desconectar");
    else { toast.success("Canal desconectado"); fetchChannels(); }
    setDisconnecting(null);
  }

  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Palette className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Nenhuma brand selecionada</h3>
        <p className="mt-1 text-sm text-muted-foreground">Selecione uma brand na barra lateral.</p>
        <Button render={<Link href="/brands" />} className="mt-6 gap-2">
          <Plus className="h-4 w-4" />Criar Brand
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Canais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeBrand.name} — redes sociais conectadas para publicação.
        </p>
      </div>

      {/* Canais conectados */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
          <Share2 className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhum canal conectado</p>
          <p className="mt-1 text-xs text-muted-foreground">Conecte uma rede social abaixo.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              {ch.account_avatar ? (
                <Image src={ch.account_avatar} alt={ch.account_name ?? ch.platform} width={40} height={40} className="rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(ch.account_name ?? ch.platform).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{ch.account_name ?? ch.platform}</p>
                <p className="text-xs text-muted-foreground">{PLATFORM_LABEL[ch.platform] ?? ch.platform}</p>
              </div>
              <button
                onClick={() => handleDisconnect(ch.id)}
                disabled={disconnecting === ch.id}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                title="Desconectar"
              >
                {disconnecting === ch.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Grid de plataformas para conectar */}
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">Conectar nova rede social</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {PLATFORMS.map((p) => {
            const already = channels.some((c) => c.platform === p.id);
            const isConnecting = connecting === p.id;
            return (
              <button
                key={p.id}
                onClick={() => !already && handleConnect(p.id)}
                disabled={isConnecting || !!connecting}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors
                  ${already
                    ? "border-primary/30 bg-primary/5 text-primary cursor-default"
                    : "border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
              >
                {isConnecting ? <RefreshCw className="h-4 w-4 animate-spin shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
                <span className="truncate">{p.label}</span>
                {already && <span className="ml-auto text-[10px] font-medium text-primary">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
