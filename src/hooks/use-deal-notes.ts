import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface DealNote {
  id: string;
  deal_id: string;
  contact_id: string;
  user_id: string;
  note: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    email: string;
    user_metadata?: {
      avatar_url?: string;
      full_name?: string;
    };
  };
}

export function useDealNotes() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const fetchNotes = useCallback(
    async (dealId: string): Promise<DealNote[]> => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('deal_notes')
          .select('*, author:user_id(id, email, user_metadata)')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data ?? []) as DealNote[];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const addNote = useCallback(
    async (dealId: string, contactId: string, accountId: string, note: string) => {
      const { data, error } = await supabase
        .from('deal_notes')
        .insert({
          deal_id: dealId,
          contact_id: contactId,
          account_id: accountId,
          note,
          user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [supabase]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      const { error } = await supabase
        .from('deal_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    },
    [supabase]
  );

  return { fetchNotes, addNote, deleteNote, loading };
}
