"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  ChevronDown,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Target,
  DollarSign,
  Users,
  Award,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";
import { useStageTracking, type StageTrackingStats } from "@/hooks/use-stage-tracking";

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

const PROB_CONFIG = {
  alta: { label: "Alta", color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
  media: { label: "Média", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
  baixa: { label: "Baixa", color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
};

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <>{display}</>;
}

export default function RelatoriosPage() {
  const supabase = createClient();
  const { defaultCurrency } = useAuth();
  const { fetchStageStats } = useStageTracking();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagError, setDiagError] = useState("");
  const [funnelVisible, setFunnelVisible] = useState(false);
  const [stageStats, setStageStats] = useState<StageTrackingStats[]>([]);

  const loadData = useCallback(async (pipelineId: string) => {
    const [{ data: s }, { data: d }, stats] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("position"),
      supabase.from("deals").select("*, contact:contacts(*)").eq("pipeline_id", pipelineId),
      fetchStageStats(pipelineId),
    ]);
    setStages(s ?? []);
    setDeals((d ?? []) as Deal[]);
    setStageStats(stats);
    setTimeout(() => setFunnelVisible(true), 100);
  }, [supabase, fetchStageStats]);

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
    setFunnelVisible(false);
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
  const valorTotal = stageData.reduce((s, st) => s + st.totalValue, 0);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "#06b6d4",
            borderRightColor: "#6366f1",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <p style={{ color: "#556677", fontSize: 13 }}>Carregando dados...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const kpis = [
    {
      icon: Users,
      label: "Leads no topo",
      value: totalEntrada,
      suffix: "",
      color: "#06b6d4",
      glow: "rgba(6,182,212,0.2)",
    },
    {
      icon: Award,
      label: "Negócios ganhos",
      value: totalGanhos,
      suffix: "",
      color: "#22c55e",
      glow: "rgba(34,197,94,0.2)",
    },
    {
      icon: Target,
      label: "Conversão geral",
      value: Number(taxaGeral),
      suffix: "%",
      color: "#a78bfa",
      glow: "rgba(167,139,250,0.2)",
    },
    {
      icon: DollarSign,
      label: "Valor em aberto",
      value: null,
      formatted: formatCurrency(valorTotal, defaultCurrency),
      color: "#f59e0b",
      glow: "rgba(245,158,11,0.2)",
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 48px" }}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes funnelIn {
          from { opacity: 0; transform: scaleX(0.7) translateY(10px); }
          to   { opacity: 1; transform: scaleX(1) translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes diagIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .kpi-card:hover { transform: translateY(-2px); }
        .kpi-card { transition: transform 0.2s cubic-bezier(0.4,0,0.2,1); }
        .funnel-bar { transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }
        .causa-card:hover { border-color: rgba(255,255,255,0.12) !important; }
        .causa-card { transition: border-color 0.15s ease; }
        .diag-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 24px rgba(6,182,212,0.4), 0 0 48px rgba(6,182,212,0.15) !important; }
        .diag-btn { transition: all 0.2s cubic-bezier(0.4,0,0.2,1); }
        .pipeline-select:hover { border-color: rgba(255,255,255,0.18) !important; background: rgba(255,255,255,0.06) !important; }
        .pipeline-select { transition: all 0.15s ease; }
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16, marginBottom: 32,
        animation: "fadeSlideUp 0.5s ease both",
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
            color: "#e2e8f0", margin: 0, lineHeight: 1.2,
          }}>
            Relatórios
          </h1>
          <p style={{ color: "#556677", fontSize: 13, marginTop: 4 }}>
            Análise do funil de vendas · diagnóstico por IA
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="pipeline-select"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "8px 14px",
              color: "#e2e8f0", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <GitBranch style={{ width: 14, height: 14, color: "#06b6d4" }} />
            {selectedPipeline?.name ?? "Selecionar Pipeline"}
            <ChevronDown style={{ width: 14, height: 14, color: "#556677" }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ minWidth: 220 }}>
            {pipelines.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{ color: p.id === selectedId ? "#06b6d4" : undefined }}
              >
                <GitBranch style={{ marginRight: 8, width: 14, height: 14 }} />
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {stages.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "80px 0", borderRadius: 20,
          border: "1px dashed rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}>
          <GitBranch style={{ width: 48, height: 48, color: "#334155", marginBottom: 16 }} />
          <p style={{ color: "#556677", fontSize: 14 }}>Nenhuma etapa configurada neste pipeline</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12, marginBottom: 24,
          }}>
            {kpis.map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <div key={i} className="kpi-card" style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  padding: "20px 22px",
                  position: "relative",
                  overflow: "hidden",
                  animation: `fadeSlideUp 0.5s ease ${i * 0.07}s both`,
                }}>
                  {/* Glow BG */}
                  <div style={{
                    position: "absolute", top: -40, right: -40,
                    width: 120, height: 120, borderRadius: "50%",
                    background: `radial-gradient(circle, ${kpi.glow} 0%, transparent 70%)`,
                    pointerEvents: "none",
                    animation: "glowPulse 3s ease-in-out infinite",
                  }} />
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#556677",
                    }}>
                      {kpi.label}
                    </span>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: `${kpi.glow}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon style={{ width: 14, height: 14, color: kpi.color }} />
                    </div>
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em",
                    color: "#e2e8f0", fontVariantNumeric: "tabular-nums",
                  }}>
                    {kpi.formatted ?? (
                      <>
                        <AnimatedNumber value={kpi.value ?? 0} />
                        {kpi.suffix}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Funil Visual */}
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 20, padding: "28px 32px",
            marginBottom: 16,
            animation: "fadeSlideUp 0.5s ease 0.25s both",
            position: "relative", overflow: "hidden",
          }}>
            {/* Decorative glow */}
            <div style={{
              position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
              width: 400, height: 200, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <h2 style={{
              fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "#556677", marginBottom: 28,
            }}>
              Funil de Vendas
            </h2>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              {stageData.map((s, i) => {
                const prev = i > 0 ? stageData[i - 1] : null;
                const dropRate = prev && prev.totalDeals > 0
                  ? (((prev.totalDeals - s.totalDeals) / prev.totalDeals) * 100).toFixed(0)
                  : null;
                const widthPct = Math.max((s.totalDeals / maxDeals) * 100, 10);
                const isGargalo = diagnostico?.gargalo === s.stageName;

                return (
                  <div key={s.stageId} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    {dropRate && Number(dropRate) > 0 && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "4px 0", fontSize: 11,
                      }}>
                        <TrendingDown style={{ width: 11, height: 11, color: Number(dropRate) > 50 ? "#ef4444" : "#f59e0b" }} />
                        <span style={{ color: Number(dropRate) > 50 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                          -{dropRate}% de queda
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        width: funnelVisible ? `${widthPct}%` : "10%",
                        minWidth: 180,
                        maxWidth: "100%",
                        transition: `width 0.8s cubic-bezier(0.4,0,0.2,1) ${i * 0.08}s`,
                        background: `linear-gradient(90deg, ${s.color}cc, ${s.color}88)`,
                        borderRadius: 10,
                        padding: "10px 18px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 3,
                        boxShadow: isGargalo
                          ? `0 0 20px ${s.color}60, 0 0 40px ${s.color}20`
                          : `0 2px 12px rgba(0,0,0,0.3)`,
                        border: isGargalo ? `1px solid ${s.color}80` : "1px solid transparent",
                        position: "relative", overflow: "hidden",
                      }}
                    >
                      {/* shimmer */}
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
                        pointerEvents: "none",
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.95)", zIndex: 1 }}>
                        {s.stageName}
                        {isGargalo && (
                          <span style={{
                            marginLeft: 8, fontSize: 9, fontWeight: 700,
                            letterSpacing: "0.08em", textTransform: "uppercase",
                            background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4,
                          }}>
                            GARGALO
                          </span>
                        )}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, zIndex: 1 }}>
                        <span style={{
                          fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {s.totalDeals}
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>deals</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legenda */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8, marginTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.04)",
              paddingTop: 20,
            }}>
              {stageData.map((s) => (
                <div key={s.stageId} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 10, padding: "10px 14px",
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: s.color, flexShrink: 0,
                    boxShadow: `0 0 6px ${s.color}80`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#8899aa", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.stageName}
                    </p>
                    <p style={{ fontSize: 11, color: "#556677", margin: 0, marginTop: 2 }}>
                      <span style={{ color: "#22c55e" }}>{s.wonDeals} ganhos</span>
                      {" · "}
                      <span style={{ color: "#ef4444" }}>{s.lostDeals} perdidos</span>
                      {" · "}
                      {s.openDeals} aberto
                    </p>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#8899aa", flexShrink: 0 }}>
                    {formatCurrency(s.totalValue, defaultCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Tempo por Etapa */}
          {stageStats.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 20, padding: "28px 32px",
              marginBottom: 16,
              animation: "fadeSlideUp 0.5s ease 0.35s both",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 24,
              }}>
                <h2 style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: "#556677",
                }}>
                  Tempo Médio por Etapa
                </h2>
                <AlertTriangle style={{ width: 14, height: 14, color: "#f59e0b" }} />
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}>
                {stageStats.map((stat) => (
                  <div
                    key={stat.stageId}
                    style={{
                      background: stat.isBottleneck
                        ? "rgba(245,158,11,0.08)"
                        : "rgba(255,255,255,0.03)",
                      border: stat.isBottleneck
                        ? "1.5px solid rgba(245,158,11,0.3)"
                        : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "16px 20px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {stat.isBottleneck && (
                      <div style={{
                        position: "absolute", top: 0, right: 0,
                        background: "#f59e0b", color: "#1a1a1a",
                        fontSize: 9, fontWeight: 700, padding: "4px 8px",
                        borderBottomLeftRadius: 8,
                      }}>
                        GARGALO
                      </div>
                    )}

                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 12,
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: stat.isBottleneck ? "#f59e0b" : "#c4d4e0",
                      }}>
                        {stat.stageName}
                      </span>
                      <span style={{
                        fontSize: 10, color: "#7a8da2",
                      }}>
                        n={stat.totalTransitions}
                      </span>
                    </div>

                    <div style={{
                      fontSize: 24, fontWeight: 700, color: stat.isBottleneck ? "#f59e0b" : "#e2e8f0",
                      marginBottom: 8,
                    }}>
                      {stat.avgDurationHours}h
                    </div>

                    <div style={{
                      display: "flex", gap: 12, fontSize: 11, color: "#7a8da2",
                    }}>
                      <span>{stat.avgDurationMinutes}m</span>
                      <span>•</span>
                      <span>{stat.avgDurationSeconds}s</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 16, padding: 12, background: "rgba(245,158,11,0.05)",
                border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8,
                fontSize: 12, color: "#c4d4e0",
              }}>
                <strong>💡 Dica:</strong> A etapa em <strong>GARGALO</strong> é onde mais tempo é gasto. Considere otimizar esse processo.
              </div>
            </div>
          )}

          {/* Diagnóstico IA */}
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 20, padding: "28px 32px",
            animation: "fadeSlideUp 0.5s ease 0.35s both",
            position: "relative", overflow: "hidden",
          }}>
            {/* BG glow */}
            <div style={{
              position: "absolute", bottom: -60, right: -60,
              width: 300, height: 300, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: diagnostico || diagError ? 24 : 0 }}>
              <div>
                <h2 style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: "#556677", margin: 0,
                }}>
                  Diagnóstico por IA
                </h2>
                <p style={{ color: "#334155", fontSize: 12, marginTop: 4 }}>
                  Gemini 2.5 Flash · análise de gargalos e causas de abandono
                </p>
              </div>

              <button
                className="diag-btn"
                onClick={handleDiagnostico}
                disabled={diagLoading || stageData.every((s) => s.totalDeals === 0)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "linear-gradient(135deg, #06b6d4, #6366f1)",
                  border: "none", borderRadius: 10,
                  padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  color: "#fff", cursor: diagLoading ? "not-allowed" : "pointer",
                  opacity: diagLoading ? 0.7 : 1,
                  boxShadow: "0 0 16px rgba(6,182,212,0.2), 0 4px 16px rgba(0,0,0,0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                {diagLoading ? (
                  <>
                    <Loader2 style={{ width: 14, height: 14, animation: "spin 0.8s linear infinite" }} />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Sparkles style={{ width: 14, height: 14 }} />
                    Gerar Diagnóstico
                  </>
                )}
              </button>
            </div>

            {diagError && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10, padding: "12px 16px",
                fontSize: 13, color: "#f87171",
              }}>
                <AlertTriangle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                {diagError}
              </div>
            )}

            {diagnostico && (
              <div style={{ animation: "diagIn 0.4s ease both" }}>
                {/* Resumo */}
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "16px 20px",
                  marginBottom: 12,
                }}>
                  <p style={{ fontSize: 14, color: "#8899aa", lineHeight: 1.6, margin: 0 }}>
                    {diagnostico.resumo}
                  </p>
                  <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#556677" }}>
                      Conversão:{" "}
                      <strong style={{ color: "#06b6d4" }}>{diagnostico.taxaConversao}%</strong>
                    </span>
                    <span style={{ fontSize: 12, color: "#556677" }}>
                      Gargalo principal:{" "}
                      <strong style={{ color: "#f59e0b" }}>{diagnostico.gargalo}</strong>
                    </span>
                  </div>
                </div>

                {/* Ponto forte */}
                {diagnostico.pontoForte && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.15)",
                    borderRadius: 10, padding: "12px 16px",
                    marginBottom: 16, fontSize: 13, color: "#4ade80",
                  }}>
                    <TrendingUp style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                    {diagnostico.pontoForte}
                  </div>
                )}

                {/* Causas */}
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "#334155",
                  marginBottom: 10,
                }}>
                  Causas prováveis de abandono
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {diagnostico.causasPravaveis?.map((c, i) => {
                    const cfg = PROB_CONFIG[c.probabilidade] ?? PROB_CONFIG.baixa;
                    return (
                      <div key={i} className="causa-card" style={{
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                        borderRadius: 12, padding: "14px 18px",
                        animation: `diagIn 0.4s ease ${i * 0.06}s both`,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0, flex: 1 }}>
                            {c.causa}
                          </p>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: cfg.color,
                            background: `${cfg.bg}`,
                            border: `1px solid ${cfg.border}`,
                            borderRadius: 20, padding: "3px 10px",
                            flexShrink: 0,
                          }}>
                            {cfg.label}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "#556677", margin: 0, marginTop: 6 }}>
                          → {c.acao}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
