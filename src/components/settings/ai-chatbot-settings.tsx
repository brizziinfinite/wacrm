"use client";

import { useState, useEffect } from "react";
import { useAiChatbot } from "@/hooks/use-ai-chatbot";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export function AiChatbotSettings() {
  const { accountId } = useAuth();
  const { fetchConfig, saveConfig } = useAiChatbot();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    "Você é um assistente de atendimento ao cliente. Seja amigável, conciso e útil. Se não souber responder, peça para falar com um atendente humano."
  );
  const [endKeyword, setEndKeyword] = useState("falar com atendente");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [saving, setSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (accountId) loadConfig();
  }, [accountId]);

  const loadConfig = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const config = await fetchConfig(accountId);
      if (config) {
        setEnabled(config.enabled);
        setSystemPrompt(config.system_prompt);
        setEndKeyword(config.end_keyword);
        setModel(config.model);
        setTemperature(config.temperature);
        setIsConfigured(true);
      }
    } catch (err) {
      console.error("Erro ao carregar config:", err);
      toast.error("Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!systemPrompt.trim() || !accountId) {
      toast.error("Preencha o prompt do sistema");
      return;
    }

    setSaving(true);
    try {
      await saveConfig(
        accountId,
        enabled,
        systemPrompt.trim(),
        endKeyword.trim(),
        model,
        temperature
      );
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
        <h2 className="text-lg font-semibold">Gemini Chatbot</h2>
        <p className="text-sm text-muted-foreground mt-1">
          IA conversacional para atendimento automático. Entende contexto, responde natural.
        </p>
      </div>

      <div className="space-y-4 max-w-2xl">
        {/* Status */}
        {isConfigured && enabled && (
          <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-600">Ativo e pronto para usar</span>
          </div>
        )}

        {/* Enable Toggle */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded cursor-pointer"
          />
          <label className="text-sm font-medium cursor-pointer flex-1">
            Ativar Gemini Chatbot nesta conta
          </label>
        </div>

        {/* System Prompt */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Instrução do Sistema</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Define personalidade e comportamento do bot. Seja específico.
          </p>
        </div>

        {/* End Keyword */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Palavra-chave para Encerrar</label>
          <input
            type="text"
            placeholder="falar com atendente"
            value={endKeyword}
            onChange={(e) => setEndKeyword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <p className="text-[10px] text-muted-foreground">
            Cliente digita isso → bot encerra, passa para humano
          </p>
        </div>

        {/* Model */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Modelo LLM</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recomendado)</option>
            <option value="gemini-2.0-pro">Gemini 2.0 Pro (Mais poderoso)</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
          <p className="text-[10px] text-muted-foreground">
            Flash = mais rápido + barato. Pro = mais inteligente.
          </p>
        </div>

        {/* Temperature */}
        <div className="space-y-1">
          <label className="text-xs font-medium">
            Criatividade (Temperature): {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            0 = determinístico (respostas fixas). 1 = balanceado. 2 = criativo (variado).
          </p>
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
          <li>Webhook detecta bot_type='gemini'</li>
          <li>Chama Gemini com histórico da conversa + system prompt</li>
          <li>Resposta volta para o cliente automaticamente</li>
          <li>Se digitar end_keyword → transfere para atendente humano</li>
        </ol>
      </div>

      {/* Pricing */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-amber-900">💰 Custo Estimado:</p>
        <p className="text-xs text-amber-800">
          ~R$ 0,001 por mensagem (Gemini Flash). 10k msg/dia = ~R$ 10/mês.
        </p>
      </div>
    </div>
  );
}
