import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TypebotConfig {
  id: string;
  account_id: string;
  typebot_slug: string;
  typebot_api_key: string;
  end_keyword: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function useTypebotConfig() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(
    async (accountId: string): Promise<TypebotConfig | null> => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('typebot_configs')
          .select('*')
          .eq('account_id', accountId)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        return (data ?? null) as TypebotConfig | null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const saveConfig = useCallback(
    async (
      accountId: string,
      typebotSlug: string,
      typebotApiKey: string,
      endKeyword: string,
      enabled: boolean
    ): Promise<TypebotConfig> => {
      const { data, error } = await supabase
        .from('typebot_configs')
        .upsert(
          {
            account_id: accountId,
            typebot_slug: typebotSlug,
            typebot_api_key: typebotApiKey,
            end_keyword: endKeyword,
            enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data as TypebotConfig;
    },
    [supabase]
  );

  return { fetchConfig, saveConfig, loading };
}
