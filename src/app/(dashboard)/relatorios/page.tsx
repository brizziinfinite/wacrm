"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitBranch, ChevronDown, Sparkles, TrendingDown, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";

interface StageData {
  stageId: string;
  stageName: string;
  position: number;
  color: string;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  openDeals: number;
  totalValue: number;
}

interface DiagnosticoCausa {
  causa: string;
  probabilidade: "alta" | "media" | "baixa";
  acao: string;
}

interface Diagnostico {
  resumo: string;
  taxaConversao: string;
  gargalo: string;
  causasPravaveis: DiagnosticoCausa[];
  pontoForte: string;
}

const PROB_COLOR: Record<string, string> = {
  alta: "text-red-400 border-red-500/30 bg-red-500/10",
  media: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  baixa: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
};

export default function RelatoriosPage() {
  const supabase = createClient();
  const { defaultCurrency } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagError, setDiagError] = useState("");

  const loadData = useCallback(async (pipelineId: string) => {
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("position"),
      supabase.from("deals").select("*, contact:contacts(*)").eq("pipeline_id", pipelineId),
    ]);
    setStages(s ?? []);
    setDeals((d ?? []) as Deal[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("pipelines").select("*").order("created_at");
      const list = data ?? [];
      setPipelines(list);
      if (list.length > 0) {
        setSelectedId(list[0].id);
        await loadData(list[0].id);
      }
      setLoading(false);
    })();
  }, [supabase, loadData]);

  useEffect(() => {
    if (!selectedId) return;
    setDiagnostico(null);
    setDiagError("");
    loadData(selectedId);
  }, [selectedId, loadData]);

  const stageData: StageData[] = stages
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const stageDeals = deals.filter((d) => d.stage_id === s.id);
      return {
        stageId: s.id,
        stageName: s.name,
        position: s.position,
        color: s.color,
        totalDeals: stageDeals.length,
        wonDeals: stageDeals.filter((d) => d.status === "won").length,
        lostDeals: stageDeals.filter((d) => d.status === "lost").length,
        openDeals: stageDeals.filter((d) => !d.status || d.status === "open").length,
        totalValue: stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0),
      };
    });

  const maxDeals = Math.max(...stageData.map((s) => s.totalDeals), 1);
  const totalEntrada = stageData[0]?.totalDeals ?? 0;
  const totalGanhos = stageData.reduce((s, st) => s + st.wonDeals, 0);
  const taxaGeral = totalEntrada > 0 ? ((totalGanhos / totalEntrada) * 100).toFixed(1) : "0";
  const selectedPipeline = pipelines.find((p) => p.id === selectedId);

  async function handleDiagnostico() {
    if (!stageData.length) return;
    setDiagLoading(true);
    setDiagError("");
    setDiagnostico(null);
    try {
      const res = await fetch("/api/relatorios/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: stageData, pipelineName: selectedPipeline?.name ?? "Pipeline" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as Diagnostico;
      setDiagnostico(data);
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : "Erro ao gerar diagnóstico");
    } finally {
      setDiagLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Funil de vendas e diagnóstico por IA</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="font-semibold">{selectedPipeline?.name ?? "Selecionar Pipeline"}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 border-border bg-popover">
            {pipelines.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={p.id === selectedId ? "text-primary" : "text-popover-foreground"}
              >
                <GitBranch className="mr-2 h-3.5 w-3.5" />
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma etapa configurada neste pipeline</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Leads no topo</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{totalEntrada}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Negócios ganhos</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{totalGanhos}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Taxa de conversão</p>
              <p className="mt-1 text-2xl font-bold text-primary">{taxaGeral}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Valor total (aberto)</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(stageData.reduce((s, st) => s + st.totalValue, 0), defaultCurrency)}
              </p>
            </div>
          </div>

          {/* Funil Visual */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-sm font-semibold text-foreground">Funil de Vendas</h2>
            <div className="flex flex-col items-center gap-1">
              {stageData.map((s, i) => {
                const prev = i > 0 ? stageData[i - 1] : null;
                const dropRate = prev && prev.totalDeals > 0
                  ? (((prev.totalDeals - s.totalDeals) / prev.totalDeals) * 100).toFixed(0)
                  : null;
                const widthPct = maxDeals > 0 ? Math.max((s.totalDeals / maxDeals) * 100, 8) : 8;

                return (
                  <div key={s.stageId} className="flex w-full flex-col items-center">
                    {dropRate && Number(dropRate) > 0 && (
                      <div className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground">
                        <TrendingDown className="h-3 w-3 text-red-400" />
                        <span className="text-red-400">-{dropRate}%</span>
                      </div>
                    )}
                    <div
                      className="flex items-center justify-between gap-4 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all"
                      style={{
                        width: `${widthPct}%`,
                        minWidth: "200px",
                        backgroundColor: s.color,
                        opacity: 0.85 + (i / stageData.length) * 0.15,
                      }}
                    >
                      <span className="truncate">{s.stageName}</span>
                      <span className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-xs">
                        {s.totalDeals}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legenda por etapa */}
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stageData.map((s) => (
                <div key={s.stageId} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{s.stageName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.wonDeals} ganhos · {s.lostDeals} perdidos · {s.openDeals} aberto
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {formatCurrency(s.totalValue, defaultCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Diagnóstico IA */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Diagnóstico por IA</h2>
                <p className="text-xs text-muted-foreground">Gemini 2.5 Flash analisa gargalos e causas prováveis de abandono</p>
              </div>
              <Button
                onClick={handleDiagnostico}
                disabled={diagLoading || stageData.every((s) => s.totalDeals === 0)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {diagLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar Diagnóstico
                  </>
                )}
              </Button>
            </div>

            {diagError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {diagError}
              </div>
            )}

            {diagnostico && (
              <div className="mt-5 space-y-4">
                {/* Resumo */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">{diagnostico.resumo}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Taxa de conversão: <strong className="text-primary">{diagnostico.taxaConversao}%</strong></span>
                    <span>Gargalo principal: <strong className="text-amber-400">{diagnostico.gargalo}</strong></span>
                  </div>
                </div>

                {/* Ponto forte */}
                {diagnostico.pontoForte && (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{diagnostico.pontoForte}</span>
                  </div>
                )}

                {/* Causas prováveis */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Causas prováveis de abandono</p>
                  <div className="space-y-2">
                    {diagnostico.causasPravaveis?.map((c, i) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{c.causa}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROB_COLOR[c.probabilidade] ?? ""}`}>
                            {c.probabilidade}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">→ {c.acao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
