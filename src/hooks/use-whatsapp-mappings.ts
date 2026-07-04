import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface WhatsappPhoneMapping {
  id: string
  account_id: string
  phone_number: string
  whatsapp_client_id: string
  active: boolean
  created_at: string
  updated_at: string
}

export function useWhatsappMappings() {
  const supabase = createClient()
  const [mappings, setMappings] = useState<WhatsappPhoneMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMappings = async (accountId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('whatsapp_phone_mappings')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      if (err) throw err
      setMappings(data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mappings')
    } finally {
      setLoading(false)
    }
  }

  const addMapping = async (
    accountId: string,
    phoneNumber: string,
    whatsappClientId: string
  ) => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('whatsapp_phone_mappings')
        .insert({
          account_id: accountId,
          phone_number: phoneNumber,
          whatsapp_client_id: whatsappClientId,
          active: true,
        })
        .select()
        .single()

      if (err) throw err
      setMappings([data, ...mappings])
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar mapping'
      setError(msg)
      throw err
    }
  }

  const toggleMapping = async (id: string, active: boolean) => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('whatsapp_phone_mappings')
        .update({ active: !active })
        .eq('id', id)
        .select()
        .single()

      if (err) throw err
      setMappings(mappings.map(m => (m.id === id ? data : m)))
      return data
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar mapping')
      throw err
    }
  }

  const deleteMapping = async (id: string) => {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('whatsapp_phone_mappings')
        .delete()
        .eq('id', id)

      if (err) throw err
      setMappings(mappings.filter(m => m.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar mapping')
      throw err
    }
  }

  return {
    mappings,
    loading,
    error,
    fetchMappings,
    addMapping,
    toggleMapping,
    deleteMapping,
  }
}
