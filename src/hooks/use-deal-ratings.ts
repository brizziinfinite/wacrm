import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface DealRating {
  id: string;
  deal_id: string;
  contact_id: string;
  user_id: string;
  account_id: string;
  rate: number;
  comment?: string;
  created_at: string;
}

export function useDealRatings() {
  const supabase = createClient();

  const fetchRatingsByUser = useCallback(
    async (userId: string, accountId: string): Promise<DealRating[]> => {
      const { data, error } = await supabase
        .from('deal_ratings')
        .select('*')
        .eq('user_id', userId)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as DealRating[];
    },
    [supabase]
  );

  const fetchAvgRatingByUser = useCallback(
    async (userId: string, accountId: string): Promise<number> => {
      const { data, error } = await supabase
        .from('deal_ratings')
        .select('rate')
        .eq('user_id', userId)
        .eq('account_id', accountId);

      if (error) throw error;
      if (!data || data.length === 0) return 0;

      const avg =
        data.reduce((sum, r) => sum + r.rate, 0) / data.length;
      return Math.round(avg * 10) / 10;
    },
    [supabase]
  );

  const fetchAvgRatingByPipeline = useCallback(
    async (
      pipelineId: string,
      accountId: string
    ): Promise<Map<string, number>> => {
      const { data, error } = await supabase.rpc(
        'avg_rating_by_pipeline',
        { p_pipeline_id: pipelineId, p_account_id: accountId }
      );

      if (error) {
        console.warn('RPC avg_rating_by_pipeline não existe, calculando no cliente:', error);
        return new Map();
      }

      const map = new Map<string, number>();
      (data ?? []).forEach(
        (row: { user_id: string; avg_rate: number }) => {
          map.set(row.user_id, row.avg_rate);
        }
      );
      return map;
    },
    [supabase]
  );

  const addRating = useCallback(
    async (
      dealId: string,
      contactId: string,
      userId: string,
      accountId: string,
      rate: number,
      comment?: string
    ): Promise<DealRating> => {
      const { data, error } = await supabase
        .from('deal_ratings')
        .insert({
          deal_id: dealId,
          contact_id: contactId,
          user_id: userId,
          account_id: accountId,
          rate,
          comment,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DealRating;
    },
    [supabase]
  );

  return {
    fetchRatingsByUser,
    fetchAvgRatingByUser,
    fetchAvgRatingByPipeline,
    addRating,
  };
}
