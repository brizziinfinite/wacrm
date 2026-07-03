-- Migration 038: ai_chatbot — Gemini como chatbot principal
-- Typebot fica como opção (bot_type: 'gemini' | 'typebot' | 'inactive')

ALTER TABLE conversations
  RENAME COLUMN typebot_status TO bot_status;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_type TEXT DEFAULT 'inactive', -- gemini, typebot, inactive
  ADD COLUMN IF NOT EXISTS bot_context JSONB DEFAULT '{}'; -- histórico de conversa, sistema prompt

-- Criar tabela de config de IA
CREATE TABLE IF NOT EXISTS ai_chatbot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  system_prompt TEXT DEFAULT 'Você é um assistente de atendimento ao cliente. Seja amigável, conciso e útil. Se não souber responder, peça para falar com um atendente humano.',
  end_keyword TEXT DEFAULT 'falar com atendente',
  model TEXT DEFAULT 'gemini-2.5-flash', -- modelo a usar
  temperature FLOAT DEFAULT 0.7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_chatbot_configs_account_id ON ai_chatbot_configs(account_id);

-- RLS
ALTER TABLE ai_chatbot_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_chatbot_configs_select_account ON ai_chatbot_configs
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY ai_chatbot_configs_insert_account ON ai_chatbot_configs
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_chatbot_configs_update_account ON ai_chatbot_configs
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_chatbot_configs_delete_account ON ai_chatbot_configs
  FOR DELETE
  USING (is_account_member(account_id));

CREATE INDEX idx_conversations_bot_type ON conversations(bot_type);
CREATE INDEX idx_conversations_bot_status ON conversations(bot_status);

COMMENT ON COLUMN conversations.bot_type IS
  'Tipo de bot: gemini (IA), typebot (visual), inactive (desativado).';

COMMENT ON COLUMN conversations.bot_status IS
  'Status anterior (renomeado de typebot_status). Mantém compatibilidade.';

COMMENT ON COLUMN conversations.bot_context IS
  'JSONB com histórico de conversa e contexto. Ex: {\"messages\": [], \"user_name\": \"\", \"user_phone\": \"\"}'.;

COMMENT ON TABLE ai_chatbot_configs IS
  'Configuração de Gemini chatbot por account.';

COMMENT ON COLUMN ai_chatbot_configs.system_prompt IS
  'Prompt do sistema. Define personalidade e comportamento do bot.';
