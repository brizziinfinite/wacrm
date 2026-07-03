-- Migration 035: scheduled_messages — agendamento de mensagens por contato
-- Follow-up automático sem broadcast manual

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_url TEXT,
  send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, sent, failed, cancelled
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_messages_contact_id ON scheduled_messages(contact_id);
CREATE INDEX idx_scheduled_messages_account_id ON scheduled_messages(account_id);
CREATE INDEX idx_scheduled_messages_send_at ON scheduled_messages(send_at);
CREATE INDEX idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX idx_scheduled_messages_status_send_at ON scheduled_messages(status, send_at) WHERE status = 'pending';

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_messages_select_account ON scheduled_messages
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY scheduled_messages_insert_account ON scheduled_messages
  FOR INSERT
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY scheduled_messages_update_own ON scheduled_messages
  FOR UPDATE
  USING (is_account_member(account_id) AND user_id = auth.uid())
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY scheduled_messages_delete_own ON scheduled_messages
  FOR DELETE
  USING (is_account_member(account_id) AND user_id = auth.uid());

COMMENT ON TABLE scheduled_messages IS
  'Mensagens agendadas para envio posterior. Follow-up automático sem broadcast.';

COMMENT ON COLUMN scheduled_messages.status IS
  'Status: pending (aguardando envio), sent (enviada), failed (falha), cancelled (cancelada).';

COMMENT ON COLUMN scheduled_messages.send_at IS
  'Data/hora para envio. Cron roda a cada minuto e processa pending.';

COMMENT ON COLUMN scheduled_messages.media_url IS
  'URL de mídia opcional (imagem, vídeo, documento).';
