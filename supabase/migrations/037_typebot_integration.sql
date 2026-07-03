-- Migration 037: typebot_integration — bot visual sem código
-- Sessão persistida, keyword para encerramento

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS typebot_session_id TEXT,
  ADD COLUMN IF NOT EXISTS typebot_status TEXT DEFAULT 'inactive'; -- inactive, active, paused

-- Typebot config por account
CREATE TABLE IF NOT EXISTS typebot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  typebot_slug TEXT NOT NULL,
  typebot_api_key TEXT NOT NULL,
  end_keyword TEXT DEFAULT 'encerrar', -- palavra-chave para sair do bot
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_typebot_configs_account_id ON typebot_configs(account_id);

-- RLS
ALTER TABLE typebot_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY typebot_configs_select_account ON typebot_configs
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY typebot_configs_insert_account ON typebot_configs
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY typebot_configs_update_account ON typebot_configs
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY typebot_configs_delete_account ON typebot_configs
  FOR DELETE
  USING (is_account_member(account_id));

CREATE INDEX idx_conversations_typebot_status ON conversations(typebot_status);
CREATE INDEX idx_conversations_typebot_session ON conversations(typebot_session_id);

COMMENT ON COLUMN conversations.typebot_session_id IS
  'Session ID do Typebot. Persistido para continuar conversa.';

COMMENT ON COLUMN conversations.typebot_status IS
  'Status: inactive (sem bot), active (rodando), paused (pausado).';

COMMENT ON TABLE typebot_configs IS
  'Configuração do Typebot por account. Slug e chave de API.';

COMMENT ON COLUMN typebot_configs.end_keyword IS
  'Palavra-chave para encerrar sessão e voltar ao atendente. Ex: \"encerrar\", \"falar com atendente\".';
