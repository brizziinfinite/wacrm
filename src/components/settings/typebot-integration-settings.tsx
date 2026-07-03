"use client";

import { useState, useEffect } from "react";
import { useTypebotConfig } from "@/hooks/use-typebot-config";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

export function TypebotIntegrationSettings() {
  const { accountId } = useAuth();
  const { fetchConfig, saveConfig, loading } = useTypebotConfig();
  const [slug, setSlug] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endKeyword, setEndKeyword] = useState("encerrar");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (accountId) loadConfig();
  }, [accountId]);

  const loadConfig = async () => {
    if (!accountId) return;
    try {
      const config = await fetchConfig(accountId);
      if (config) {
        setSlug(config.typebot_slug);
        setApiKey(config.typebot_api_key);
        setEndKeyword(config.end_keyword);
        setEnabled(config.enabled);
        setIsConfigured(true);
      }
    } catch (err) {
      console.error("Erro ao carregar config:", err);
      toast.error("Erro ao carregar configuração");
    }
  };

  const handleSave = async () => {
    if (!slug.trim() || !apiKey.trim() || !accountId) {
      toast.error("Preencha slug e chave de API");
      return;
    }

    setSaving(true);
    try {
      await saveConfig(accountId, slug.trim(), apiKey.trim(), endKeyword.trim(), enabled);
      setIsConfigured(true);
      toast.success("Configuração salva");
    } catch (err) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Integração Typebot</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Chatbot visual sem código. Sessão persistida e integrado ao WhatsApp.
        </p>
      </div>

      <div className="space-y-4 max-w-lg">
        {/* Status */}
        {isConfigured && (
          <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-600">Configurado e ativo</span>
          </div>
        )}

        {/* Slug */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Typebot Slug</label>
          <input
            type="text"
            placeholder="Seu-bot-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <p className="text-[10px] text-muted-foreground">
            Encontre em typebot.co → seu workspace → bot settings
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Typebot API Key</label>
          <input
            type="password"
            placeholder="••••••••••••••••"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <p className="text-[10px] text-muted-foreground">
            Gere em typebot.co → Settings → API
          </p>
        </div>

        {/* End Keyword */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Palavra-chave para Encerrar</label>
          <input
            type="text"
            placeholder="encerrar"
            value={endKeyword}
            onChange={(e) => setEndKeyword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <p className="text-[10px] text-muted-foreground">
            Quando o cliente digita isso, o bot encerra e passa para atendente
          </p>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label className="text-xs font-medium cursor-pointer flex-1">
            Ativar Typebot nesta conta
          </label>
        </div>

        {/* Save */}
        <Button
          className="w-full bg-primary hover:bg-primary/90"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            "Salvar Configuração"
          )}
        </Button>
      </div>

      {/* Help */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-foreground">Como funciona:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Cliente envia mensagem no WhatsApp</li>
          <li>Webhook roteia para Typebot API se typebot_status='active'</li>
          <li>Typebot processa e responde</li>
          <li>Se digitar palavra-chave ({endKeyword}), transfere para atendente</li>
          <li>Sessão persistida em typebot_session_id</li>
        </ol>
      </div>
    </div>
  );
}
