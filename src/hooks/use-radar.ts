import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface OpportunitySource {
  id: string;
  account_id: string;
  brand_id: string;
  source_type: string;
  source_url: string;
  source_name?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  account_id: string;
  brand_id: string;
  source_id?: string;
  title: string;
  description?: string;
  url?: string;
  relevance_score: number;
  suggested_angle?: string;
  suggested_format?: string;
  urgency: string;
  source_content?: Record<string, unknown>;
  status: string;
  accepted_at?: string;
  rejected_at?: string;
  published_at?: string;
  created_by_scan_at: string;
  created_at: string;
}

export interface RadarConfig {
  id: string;
  account_id: string;
  enabled: boolean;
  scan_time: string;
  min_relevance_score: number;
  created_at: string;
  updated_at: string;
}

export function useRadar() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const fetchOpportunitiesByBrand = useCallback(
    async (brandId: string, status?: string): Promise<Opportunity[]> => {
      setLoading(true);
      try {
        let query = supabase
          .from('opportunities')
          .select('*')
          .eq('brand_id', brandId)
          .order('relevance_score', { ascending: false })
          .order('created_at', { ascending: false });

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;
        return (data ?? []) as Opportunity[];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const fetchTodayOpportunities = useCallback(
    async (brandId: string): Promise<Opportunity[]> => {
      setLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000)
          .toISOString()
          .split('T')[0];

        const { data, error } = await supabase
          .from('opportunities')
          .select('*')
          .eq('brand_id', brandId)
          .eq('status', 'pending')
          .gte('created_by_scan_at', `${today}T00:00:00Z`)
          .lt('created_by_scan_at', `${tomorrow}T00:00:00Z`)
          .order('relevance_score', { ascending: false });

        if (error) throw error;
        return (data ?? []) as Opportunity[];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const acceptOpportunity = useCallback(
    async (opportunityId: string): Promise<void> => {
      // Buscar oportunidade antes de aceitar
      const { data: opportunity, error: fetchError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single();

      if (fetchError || !opportunity) throw fetchError || new Error('Opportunity not found');

      // Atualizar status
      const { error: updateError } = await supabase
        .from('opportunities')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', opportunityId);

      if (updateError) throw updateError;

      // Auto-criar ideia baseada na oportunidade
      const { error: ideaError } = await supabase
        .from('content_ideas')
        .insert({
          brand_id: opportunity.brand_id,
          topic: opportunity.title,
          angle: opportunity.suggested_angle || opportunity.title,
          hook: opportunity.description?.slice(0, 100) || null,
          detail: opportunity.description || null,
          format: opportunity.suggested_format || 'post',
          status: 'pending',
          rationale: `Gerado pelo Radar de Oportunidades (score: ${(opportunity.relevance_score * 100).toFixed(0)}%)`,
        });

      if (ideaError) {
        console.error('Error creating idea from opportunity:', ideaError);
        // Não falhar — oportunidade já foi aceita
      }
    },
    [supabase]
  );

  const rejectOpportunity = useCallback(
    async (opportunityId: string): Promise<void> => {
      const { error } = await supabase
        .from('opportunities')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
        })
        .eq('id', opportunityId);

      if (error) throw error;
    },
    [supabase]
  );

  const fetchSources = useCallback(
    async (brandId: string): Promise<OpportunitySource[]> => {
      const { data, error } = await supabase
        .from('opportunity_sources')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at');

      if (error) throw error;
      return (data ?? []) as OpportunitySource[];
    },
    [supabase]
  );

  const addSource = useCallback(
    async (
      accountId: string,
      brandId: string,
      sourceType: string,
      sourceUrl: string,
      sourceName?: string
    ): Promise<OpportunitySource> => {
      const { data, error } = await supabase
        .from('opportunity_sources')
        .insert({
          account_id: accountId,
          brand_id: brandId,
          source_type: sourceType,
          source_url: sourceUrl,
          source_name: sourceName,
          active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as OpportunitySource;
    },
    [supabase]
  );

  const toggleSource = useCallback(
    async (sourceId: string, active: boolean): Promise<void> => {
      const { error } = await supabase
        .from('opportunity_sources')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', sourceId);

      if (error) throw error;
    },
    [supabase]
  );

  const deleteSource = useCallback(
    async (sourceId: string): Promise<void> => {
      const { error } = await supabase
        .from('opportunity_sources')
        .delete()
        .eq('id', sourceId);

      if (error) throw error;
    },
    [supabase]
  );

  return {
    fetchOpportunitiesByBrand,
    fetchTodayOpportunities,
    acceptOpportunity,
    rejectOpportunity,
    fetchSources,
    addSource,
    toggleSource,
    deleteSource,
    loading,
  };
}
