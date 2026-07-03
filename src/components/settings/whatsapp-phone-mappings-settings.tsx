'use client'

import { useState, useEffect } from 'react'
import { useWhatsappMappings } from '@/hooks/use-whatsapp-mappings'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Trash2, Plus, Toggle2 } from 'lucide-react'

export function WhatsappPhoneMappingsSettings() {
  const { user } = useAuth()
  const { mappings, loading, error, fetchMappings, addMapping, toggleMapping, deleteMapping } =
    useWhatsappMappings()

  const [phoneNumber, setPhoneNumber] = useState('')
  const [whatsappClientId, setWhatsappClientId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user?.account_id) {
      fetchMappings(user.account_id)
    }
  }, [user?.account_id])

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.account_id || !phoneNumber || !whatsappClientId) return

    setSubmitting(true)
    try {
      await addMapping(user.account_id, phoneNumber, whatsappClientId)
      setPhoneNumber('')
      setWhatsappClientId('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleMapping = async (id: string, active: boolean) => {
    try {
      await toggleMapping(id, active)
    } catch (err) {
      console.error('Erro ao toggle mapping:', err)
    }
  }

  const handleDeleteMapping = async (id: string) => {
    if (confirm('Remover este phone mapping?')) {
      try {
        await deleteMapping(id)
      } catch (err) {
        console.error('Erro ao deletar mapping:', err)
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Roteamento WhatsApp Centralizado</CardTitle>
          <CardDescription>
            Mapeie números de clientes para roteamento automático via API WhatsApp centralizada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Form adicionar mapping */}
          <form onSubmit={handleAddMapping} className="space-y-4 border-b pb-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Número do Cliente</label>
                <Input
                  type="tel"
                  placeholder="+55 11 9999-9999"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="text-sm font-medium">WhatsApp Client ID</label>
                <Input
                  type="text"
                  placeholder="ID único ou phone"
                  value={whatsappClientId}
                  onChange={(e) => setWhatsappClientId(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={submitting || !phoneNumber || !whatsappClientId}>
                  <Plus className="h-4 w-4 mr-2" />
                  {submitting ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </div>
            </div>
          </form>

          {/* Erro */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Lista de mappings */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-gray-500">Carregando mappings...</p>
            ) : mappings.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum mapping configurado</p>
            ) : (
              mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {mapping.phone_number}
                      </code>
                      <Badge variant={mapping.active ? 'default' : 'secondary'}>
                        {mapping.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">ID: {mapping.whatsapp_client_id}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleMapping(mapping.id, mapping.active)}
                    >
                      <Toggle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteMapping(mapping.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
