"use client";

import { useState, useEffect } from "react";
import { useRadar, type Opportunity } from "@/hooks/use-radar";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, X, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface RadarWidgetProps {
  brandId: string;
  accountId: string;
}

export function RadarWidget({ brandId, accountId }: RadarWidgetProps) {
  const { fetchTodayOpportunities, acceptOpportunity, rejectOpportunity, loading } = useRadar();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  useEffect(() => {
    loadOpportunities();
  }, [brandId]);

  const loadOpportunities = async () => {
    try {
      const data = await fetchTodayOpportunities(brandId);
      setOpportunities(data);
    } catch (err) {
      console.error("Erro ao carregar oportunidades:", err);
      toast.error("Erro ao carregar oportunidades");
    }
  };

  const handleAccept = async (opportunityId: string) => {
    setAccepting(opportunityId);
    try {
      await acceptOpportunity(opportunityId);
      await loadOpportunities();
      toast.success("✓ Oportunidade aceita! Ideia criada automaticamente.");
    } catch (err) {
      console.error("Erro ao aceitar:", err);
      toast.error("Erro ao aceitar oportunidade");
    } finally {
      setAccepting(null);
    }
  };

  const handleReject = async (opportunityId: string) => {
    setRejecting(opportunityId);
    try {
      await rejectOpportunity(opportunityId);
      await loadOpportunities();
      toast.success("Oportunidade rejeitada");
    } catch (err) {
      console.error("Erro ao rejeitar:", err);
      toast.error("Erro ao rejeitar oportunidade");
    } finally {
      setRejecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold">
          {opportunities.length > 0
            ? `${opportunities.length} oportunidade${opportunities.length !== 1 ? "s" : ""} hoje`
            : "Nenhuma oportunidade por enquanto"}
        </h3>
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
          Volte amanhã para novas sugestões do Radar
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => (
            <div
              key={opp.id}
              className="rounded-lg border border-border bg-muted/50 p-4 space-y-2 hover:bg-muted/70 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-foreground break-words">
                    {opp.title}
                  </h4>
                  {opp.urgency === "trending" && (
                    <div className="flex items-center gap-1 mt-1">
                      <TrendingUp className="h-3 w-3 text-red-500" />
                      <span className="text-xs text-red-600 font-semibold">TRENDING</span>
                    </div>
                  )}
                </div>
                <div className="text-xs bg-amber-500/20 text-amber-700 rounded px-2 py-1 flex-shrink-0">
                  {Math.round(opp.relevance_score * 100)}%
                </div>
              </div>

              {/* Description */}
              {opp.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {opp.description}
                </p>
              )}

              {/* Suggested Format + Angle */}
              <div className="flex flex-wrap gap-1">
                {opp.suggested_format && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-700 rounded px-2 py-0.5">
                    {opp.suggested_format}
                  </span>
                )}
                {opp.suggested_angle && (
                  <span className="text-[10px] bg-green-500/20 text-green-700 rounded px-2 py-0.5">
                    {opp.suggested_angle}
                  </span>
                )}
              </div>

              {/* URL */}
              {opp.url && (
                <a
                  href={opp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-500 hover:underline truncate"
                >
                  Ver fonte →
                </a>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  className="flex-1 h-auto bg-green-600/20 text-green-700 hover:bg-green-600/30 text-xs"
                  onClick={() => handleAccept(opp.id)}
                  disabled={accepting === opp.id || rejecting === opp.id}
                >
                  {accepting === opp.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  Usar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-auto text-xs"
                  onClick={() => handleReject(opp.id)}
                  disabled={rejecting === opp.id || accepting === opp.id}
                >
                  {rejecting === opp.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <X className="h-3 w-3 mr-1" />
                  )}
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2">
        💡 O Radar verifica notícias, trends e concorrentes todo dia às 08:00 UTC. Clique "Usar" para virar ideia.
      </div>
    </div>
  );
}
