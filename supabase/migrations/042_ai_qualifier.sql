-- Migration 042: ai_qualifier — AI-driven lead qualification bot
-- bot_type gains a third value: 'qualifier' (alongside 'gemini', 'typebot', 'inactive')

-- conversations.bot_type has no CHECK constraint (plain TEXT per 038_ai_chatbot.sql:8),
-- so no ALTER needed there — just document the new value.
COMMENT ON COLUMN conversations.bot_type IS
  'Tipo de bot: gemini (IA livre), qualifier (perguntas + score), typebot (visual), inactive (desativado).';

CREATE TABLE IF NOT EXISTS ai_qualifier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  -- Ordered list of questions to ask. Each item: {"field": "orcamento", "question": "Qual seu orçamento mensal?"}
  questions JSONB NOT NULL DEFAULT '[]',
  qualify_prompt TEXT NOT NULL DEFAULT 'Você é um qualificador de leads. Com base nas respostas coletadas, classifique o lead como "hot", "warm" ou "cold". Responda apenas com um JSON: {"score": "hot"|"warm"|"cold", "reason": "..."}.',
  hot_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  hot_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  hot_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  warm_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  cold_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  model TEXT DEFAULT 'gemini-2.5-flash',
  temperature FLOAT DEFAULT 0.3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_qualifier_configs_account_id ON ai_qualifier_configs(account_id);

ALTER TABLE ai_qualifier_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_qualifier_configs_select_account ON ai_qualifier_configs
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_insert_account ON ai_qualifier_configs
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_update_account ON ai_qualifier_configs
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY ai_qualifier_configs_delete_account ON ai_qualifier_configs
  FOR DELETE
  USING (is_account_member(account_id));

COMMENT ON TABLE ai_qualifier_configs IS
  'Configuração do bot qualificador de leads por account: perguntas, prompt de score, e mapeamento de score -> pipeline/stage/tag.';
COMMENT ON COLUMN ai_qualifier_configs.questions IS
  'Array ordenado de perguntas. Ex: [{"field": "orcamento", "question": "Qual seu orçamento mensal?"}]';
