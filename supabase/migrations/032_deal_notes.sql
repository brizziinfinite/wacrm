-- Migration 032: deal_notes — notas internas em deals/conversas
-- Atendente anota contexto para próximo atendente

CREATE TABLE IF NOT EXISTS deal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_notes_deal_id ON deal_notes(deal_id);
CREATE INDEX idx_deal_notes_contact_id ON deal_notes(contact_id);
CREATE INDEX idx_deal_notes_account_id ON deal_notes(account_id);
CREATE INDEX idx_deal_notes_created_at ON deal_notes(created_at DESC);

-- RLS
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_notes_select_account ON deal_notes
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY deal_notes_insert_account ON deal_notes
  FOR INSERT
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY deal_notes_update_own ON deal_notes
  FOR UPDATE
  USING (is_account_member(account_id) AND user_id = auth.uid())
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY deal_notes_delete_own ON deal_notes
  FOR DELETE
  USING (is_account_member(account_id) AND user_id = auth.uid());

COMMENT ON TABLE deal_notes IS
  'Notas internas em deals. Contexto entre atendentes, histórico de ações.';

COMMENT ON COLUMN deal_notes.note IS
  'Texto da nota, sem limite de tamanho.';
