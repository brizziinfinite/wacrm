import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  conversation_id?: string;
  user_id: string;
  account_id: string;
  body: string;
  media_url?: string;
  send_at: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export function useScheduledMessages() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const fetchScheduled = useCallback(
    async (contactId: string): Promise<ScheduledMessage[]> => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('scheduled_messages')
          .select('*')
          .eq('contact_id', contactId)
          .order('send_at', { ascending: false });

        if (error) throw error;
        return (data ?? []) as ScheduledMessage[];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const scheduleMessage = useCallback(
    async (
      contactId: string,
      conversationId: string | null,
      accountId: string,
      body: string,
      sendAt: Date,
      mediaUrl?: string
    ): Promise<ScheduledMessage> => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          contact_id: contactId,
          conversation_id: conversationId,
          user_id: userId,
          account_id: accountId,
          body,
          media_url: mediaUrl,
          send_at: sendAt.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as ScheduledMessage;
    },
    [supabase]
  );

  const cancelMessage = useCallback(
    async (messageId: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;
    },
    [supabase]
  );

  return { fetchScheduled, scheduleMessage, cancelMessage, loading };
}
