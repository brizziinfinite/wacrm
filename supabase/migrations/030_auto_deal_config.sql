-- Migration 030: auto_deal_pipeline_id em accounts
-- Quando preenchido, toda primeira mensagem de um contato novo
-- cria um deal automaticamente na primeira etapa desse pipeline.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS auto_deal_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;

COMMENT ON COLUMN accounts.auto_deal_pipeline_id IS
  'Pipeline que recebe deals automáticos ao chegar primeira mensagem de contato novo. NULL = desativado.';
