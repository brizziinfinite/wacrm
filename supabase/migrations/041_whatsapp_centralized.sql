-- Migration 041: WhatsApp centralizado — 1 número para N clientes
-- Router pelo contact.phone ou novo campo whatsapp_client_id

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_client_id TEXT, -- ID único do cliente (phone ou custom)
  ADD COLUMN IF NOT EXISTS whatsapp_from_number TEXT; -- Número que iniciou conversa (para routing)

CREATE INDEX idx_conversations_whatsapp_client_id ON conversations(whatsapp_client_id);
CREATE INDEX idx_conversations_whatsapp_from_number ON conversations(whatsapp_from_number);

-- Tabela de routing: phone_number → account_id (mapping central)
CREATE TABLE IF NOT EXISTS whatsapp_phone_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE, -- +55 11 9999-9999 (cliente)
  whatsapp_client_id TEXT NOT NULL, -- ID único (pode ser phone ou uuid)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_phone_mappings_phone ON whatsapp_phone_mappings(phone_number);
CREATE INDEX idx_whatsapp_phone_mappings_account_id ON whatsapp_phone_mappings(account_id);

ALTER TABLE whatsapp_phone_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_phone_mappings_select_account ON whatsapp_phone_mappings
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY whatsapp_phone_mappings_insert_account ON whatsapp_phone_mappings
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY whatsapp_phone_mappings_update_account ON whatsapp_phone_mappings
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

COMMENT ON TABLE whatsapp_phone_mappings IS
  'Mapa central: phone_number (cliente) → account_id. Para routing em API centralizada.';

COMMENT ON COLUMN conversations.whatsapp_client_id IS
  'ID único do cliente para routing. Geralmente o phone_number do cliente.';

COMMENT ON COLUMN conversations.whatsapp_from_number IS
  'Número WhatsApp que iniciou a conversa (para auditoria + debugging).';
