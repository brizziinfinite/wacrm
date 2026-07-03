import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ContactCustomField {
  id: string;
  contact_id: string;
  account_id: string;
  name: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export function useContactCustomFields() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const fetchFields = useCallback(
    async (contactId: string): Promise<ContactCustomField[]> => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('contact_custom_fields')
          .select('*')
          .eq('contact_id', contactId)
          .order('name');

        if (error) throw error;
        return (data ?? []) as ContactCustomField[];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const addField = useCallback(
    async (
      contactId: string,
      accountId: string,
      name: string,
      value: string
    ): Promise<ContactCustomField> => {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .insert({
          contact_id: contactId,
          account_id: accountId,
          name,
          value,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ContactCustomField;
    },
    [supabase]
  );

  const updateField = useCallback(
    async (
      fieldId: string,
      name: string,
      value: string
    ): Promise<ContactCustomField> => {
      const { data, error } = await supabase
        .from('contact_custom_fields')
        .update({ name, value, updated_at: new Date().toISOString() })
        .eq('id', fieldId)
        .select()
        .single();

      if (error) throw error;
      return data as ContactCustomField;
    },
    [supabase]
  );

  const deleteField = useCallback(
    async (fieldId: string) => {
      const { error } = await supabase
        .from('contact_custom_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
    },
    [supabase]
  );

  return { fetchFields, addField, updateField, deleteField, loading };
}
