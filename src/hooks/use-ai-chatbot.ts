import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AiChatbotConfig {
  id: string;
  account_id: string;
  enabled: boolean;
  system_prompt: string;
  end_keyword: string;
  model: string;
  temperature: number;
  created_at: string;
  updated_at: string;
}

export interface BotContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  user_name?: string;
  user_phone?: string;
  user_email?: string;
}

export function useAiChatbot() {
  const supabase = createClient();

  // Note: loading state é gerenciado no componente, não no hook
  const fetchConfig = useCallback(
    async (accountId: string): Promise<AiChatbotConfig | null> => {
      const { data, error } = await supabase
        .from('ai_chatbot_configs')
        .select('*')
        .eq('account_id', accountId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return (data ?? null) as AiChatbotConfig | null;
    },
    [supabase]
  );

  const saveConfig = useCallback(
    async (
      accountId: string,
      enabled: boolean,
      systemPrompt: string,
      endKeyword: string,
      model: string,
      temperature: number
    ): Promise<AiChatbotConfig> => {
      const { data, error } = await supabase
        .from('ai_chatbot_configs')
        .upsert(
          {
            account_id: accountId,
            enabled,
            system_prompt: systemPrompt,
            end_keyword: endKeyword,
            model,
            temperature,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data as AiChatbotConfig;
    },
    [supabase]
  );

  const updateConversationBotContext = useCallback(
    async (
      conversationId: string,
      botType: 'gemini' | 'typebot' | 'inactive',
      context: BotContext
    ) => {
      const { error } = await supabase
        .from('conversations')
        .update({
          bot_type: botType,
          bot_context: context,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    [supabase]
  );

  const getBotContext = useCallback(
    async (conversationId: string): Promise<BotContext | null> => {
      const { data, error } = await supabase
        .from('conversations')
        .select('bot_context')
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      return (data?.bot_context ?? null) as BotContext | null;
    },
    [supabase]
  );

  return {
    fetchConfig,
    saveConfig,
    updateConversationBotContext,
    getBotContext,
  };
}
