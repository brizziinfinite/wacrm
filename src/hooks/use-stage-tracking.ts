import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface StageTrackingStats {
  stageId: string;
  stageName: string;
  avgDurationSeconds: number;
  avgDurationMinutes: number;
  avgDurationHours: string;
  totalTransitions: number;
  isBottleneck?: boolean;
}

export function useStageTracking() {
  const supabase = createClient();

  const fetchStageStats = useCallback(
    async (pipelineId: string): Promise<StageTrackingStats[]> => {
      // Buscar histórico com nome da etapa
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select(`
          stage_id,
          duration_seconds,
          pipeline_stages!inner(id, name, pipeline_id)
        `)
        .eq('pipeline_stages.pipeline_id', pipelineId)
        .not('duration_seconds', 'is', null);

      if (error) {
        console.error('Erro ao buscar stage tracking:', error);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Agrupar por stage_id e calcular médias
      const statsMap = new Map<string, { durations: number[]; stageName: string }>();

      data.forEach((record: any) => {
        const stageId = record.stage_id;
        const stageName = record.pipeline_stages?.name || 'Unknown';
        const duration = record.duration_seconds || 0;

        if (!statsMap.has(stageId)) {
          statsMap.set(stageId, { durations: [], stageName });
        }
        statsMap.get(stageId)!.durations.push(duration);
      });

      // Converter para array com médias
      const stats: StageTrackingStats[] = Array.from(statsMap.entries()).map(
        ([stageId, { durations, stageName }]) => {
          const avgDurationSeconds = Math.round(
            durations.reduce((a, b) => a + b, 0) / durations.length
          );
          return {
            stageId,
            stageName,
            avgDurationSeconds,
            avgDurationMinutes: Math.round(avgDurationSeconds / 60),
            avgDurationHours: (avgDurationSeconds / 3600).toFixed(1),
            totalTransitions: durations.length,
          };
        }
      );

      // Identificar gargalo (maior tempo médio)
      if (stats.length > 0) {
        const maxAvg = Math.max(...stats.map((s) => s.avgDurationSeconds));
        stats.forEach((s) => {
          s.isBottleneck = s.avgDurationSeconds === maxAvg;
        });
      }

      return stats.sort((a, b) => b.avgDurationSeconds - a.avgDurationSeconds);
    },
    [supabase]
  );

  return { fetchStageStats };
}
