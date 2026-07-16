'use client';

// ============================================================
// AiQualifierSettings — Settings → AI Lead Qualifier
//
// Configures the qualifier bot (bot_type='qualifier', see migration
// 042_ai_qualifier.sql): an ordered list of questions the bot asks a
// new contact, the LLM prompt used to score the collected answers as
// hot/warm/cold, the tag applied per score, and where a "hot" lead
// gets dropped as a deal (pipeline + stage).
//
// Mirrors ai-chatbot-settings.tsx's shape (load on mount, edit local
// state, single Save button) but persists through the REST route
// added in Task 6 (`/api/ai-qualifier/config`) via useAiQualifier,
// rather than talking to Supabase directly — that route resolves
// account_id server-side and owns the upsert.
//
// No standalone pipeline/stage picker component exists yet in this
// codebase (checked: deal-form.tsx receives pipeline/stages as props,
// deals-settings.tsx and automation-builder.tsx both inline raw
// <select> markup for pipeline/tag pickers) — so the cascading
// pipeline → stage pair here follows that same inline-<select>
// convention rather than introducing a new abstraction.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';

import { useAiQualifier, DEFAULT_AI_QUALIFIER_CONFIG } from '@/hooks/use-ai-qualifier';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { AiQualifierQuestion, Pipeline, PipelineStage, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SettingsPanelHead } from './settings-panel-head';

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60';

export function AiQualifierSettings() {
  const { accountId, canEditSettings } = useAuth();
  const { config, loading, error, save } = useAiQualifier();
  const supabase = useMemo(() => createClient(), []);

  const [enabled, setEnabled] = useState(DEFAULT_AI_QUALIFIER_CONFIG.enabled);
  const [questions, setQuestions] = useState<AiQualifierQuestion[]>(
    DEFAULT_AI_QUALIFIER_CONFIG.questions
  );
  const [qualifyPrompt, setQualifyPrompt] = useState(
    DEFAULT_AI_QUALIFIER_CONFIG.qualify_prompt
  );
  const [hotPipelineId, setHotPipelineId] = useState<string>('');
  const [hotStageId, setHotStageId] = useState<string>('');
  const [hotTagId, setHotTagId] = useState<string>('');
  const [warmTagId, setWarmTagId] = useState<string>('');
  const [coldTagId, setColdTagId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);

  // Seed local form state once the config loads. Config is null for an
  // account that's never saved one — the DEFAULT_* constants (mirroring
  // migration 042's column defaults) fill the form in that case.
  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setQuestions(config.questions ?? []);
    setQualifyPrompt(config.qualify_prompt);
    setHotPipelineId(config.hot_pipeline_id ?? '');
    setHotStageId(config.hot_stage_id ?? '');
    setHotTagId(config.hot_tag_id ?? '');
    setWarmTagId(config.warm_tag_id ?? '');
    setColdTagId(config.cold_tag_id ?? '');
  }, [config]);

  // Tags + pipelines are account-scoped lookups for the pickers below.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const [{ data: tagRows }, { data: pipelineRows }] = await Promise.all([
        supabase.from('tags').select('*').order('name'),
        supabase
          .from('pipelines')
          .select('id, name')
          .eq('account_id', accountId)
          .order('created_at'),
      ]);
      if (cancelled) return;
      setTags((tagRows ?? []) as Tag[]);
      setPipelines((pipelineRows ?? []) as Pipeline[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  // Stages cascade off the selected pipeline.
  useEffect(() => {
    if (!hotPipelineId) {
      setStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', hotPipelineId)
        .order('position');
      if (cancelled) return;
      setStages((data ?? []) as PipelineStage[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [hotPipelineId, supabase]);

  // If the selected stage no longer belongs to the (possibly just
  // changed) pipeline once stages load, clear it rather than silently
  // keeping a stale/foreign stage id selected.
  useEffect(() => {
    if (!hotStageId) return;
    if (stages.length === 0) return;
    if (!stages.some((s) => s.id === hotStageId)) setHotStageId('');
  }, [stages, hotStageId]);

  function updateQuestion(index: number, patch: Partial<AiQualifierQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { field: '', question: '' }]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    if (!accountId) return;

    const trimmed = questions.map((q) => ({
      field: q.field.trim(),
      question: q.question.trim(),
    }));
    if (trimmed.some((q) => !q.field || !q.question)) {
      toast.error('Preencha campo e pergunta em todas as linhas (ou remova a linha)');
      return;
    }
    if (!qualifyPrompt.trim()) {
      toast.error('Preencha o prompt de qualificação');
      return;
    }

    setSaving(true);
    try {
      await save({
        enabled,
        questions: trimmed,
        qualify_prompt: qualifyPrompt.trim(),
        hot_pipeline_id: hotPipelineId || null,
        hot_stage_id: hotStageId || null,
        hot_tag_id: hotTagId || null,
        warm_tag_id: warmTagId || null,
        cold_tag_id: coldTagId || null,
      });
      toast.success('Configuração salva');
    } catch (err) {
      console.error('[AiQualifierSettings] save error:', err);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200 space-y-4">
      <SettingsPanelHead
        title="AI Lead Qualifier"
        description="Bot que faz perguntas a um novo contato, usa IA para classificar o lead como quente, morno ou frio, e move automaticamente leads quentes para um pipeline."
      />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Enable toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canEditSettings}
              className="h-4 w-4 cursor-pointer rounded disabled:cursor-not-allowed"
              id="ai-qualifier-enabled"
            />
            <label
              htmlFor="ai-qualifier-enabled"
              className="flex-1 cursor-pointer text-sm font-medium"
            >
              Ativar qualificador de leads nesta conta
            </label>
          </div>

          {/* Questions */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Perguntas de qualificação</Label>
            <p className="text-[10px] text-muted-foreground">
              O bot faz essas perguntas, em ordem, ao contato. &quot;Campo&quot; é a
              chave usada para guardar a resposta (ex: orcamento); &quot;Pergunta&quot;
              é o texto enviado no WhatsApp.
            </p>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-2"
                >
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => moveQuestion(i, -1)}
                      disabled={!canEditSettings || i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(i, 1)}
                      disabled={!canEditSettings || i === questions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                  <div className="grid flex-1 gap-2 sm:grid-cols-[140px_1fr]">
                    <Input
                      value={q.field}
                      onChange={(e) => updateQuestion(i, { field: e.target.value })}
                      placeholder="campo (ex: orcamento)"
                      disabled={!canEditSettings}
                      className="bg-background text-foreground"
                    />
                    <Input
                      value={q.question}
                      onChange={(e) => updateQuestion(i, { question: e.target.value })}
                      placeholder="Qual seu orçamento mensal?"
                      disabled={!canEditSettings}
                      className="bg-background text-foreground"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    disabled={!canEditSettings}
                    className="text-red-400 hover:text-red-300 disabled:opacity-30"
                    aria-label="Remover pergunta"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
              disabled={!canEditSettings}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-4" />
              Adicionar pergunta
            </Button>
          </div>

          {/* Qualify prompt */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">Prompt de qualificação</Label>
            <Textarea
              value={qualifyPrompt}
              onChange={(e) => setQualifyPrompt(e.target.value)}
              disabled={!canEditSettings}
              rows={4}
              className="resize-none bg-muted text-foreground"
            />
            <p className="text-[10px] text-muted-foreground">
              Instrução enviada à IA junto com as respostas coletadas. Deve pedir um
              JSON com <code>score</code> (hot/warm/cold).
            </p>
          </div>

          {/* Tag mapping */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Tag — Quente (hot)</Label>
              <select
                value={hotTagId}
                onChange={(e) => setHotTagId(e.target.value)}
                disabled={!canEditSettings}
                className={SELECT_CLASS}
              >
                <option value="">— Nenhuma —</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Tag — Morno (warm)</Label>
              <select
                value={warmTagId}
                onChange={(e) => setWarmTagId(e.target.value)}
                disabled={!canEditSettings}
                className={SELECT_CLASS}
              >
                <option value="">— Nenhuma —</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Tag — Frio (cold)</Label>
              <select
                value={coldTagId}
                onChange={(e) => setColdTagId(e.target.value)}
                disabled={!canEditSettings}
                className={SELECT_CLASS}
              >
                <option value="">— Nenhuma —</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hot pipeline/stage */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">
                Pipeline de destino (leads quentes)
              </Label>
              <select
                value={hotPipelineId}
                onChange={(e) => {
                  setHotPipelineId(e.target.value);
                  setHotStageId('');
                }}
                disabled={!canEditSettings}
                className={SELECT_CLASS}
              >
                <option value="">— Desativado —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Etapa</Label>
              <select
                value={hotStageId}
                onChange={(e) => setHotStageId(e.target.value)}
                disabled={!canEditSettings || !hotPipelineId || stages.length === 0}
                className={SELECT_CLASS}
              >
                <option value="">— Selecione uma etapa —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Quando um lead é classificado como quente, um deal é criado
            automaticamente nessa etapa (se configurada).
          </p>

          {canEditSettings ? (
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Configuração'
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Apenas admins podem alterar esta configuração.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="size-3.5" />
          Como funciona:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>Contato novo entra em conversa com bot_type=&apos;qualifier&apos;</li>
          <li>Bot faz as perguntas configuradas acima, em ordem</li>
          <li>Ao final, a IA classifica as respostas com o prompt de qualificação</li>
          <li>A tag correspondente ao score é aplicada ao contato</li>
          <li>Leads &quot;hot&quot; geram um deal automaticamente no pipeline/etapa escolhidos</li>
        </ol>
      </div>
    </section>
  );
}
