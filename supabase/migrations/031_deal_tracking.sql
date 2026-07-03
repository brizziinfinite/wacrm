-- Migration 031: deal_stage_history + trigger para rastreamento de tempo por etapa
-- Registra cada mudança de etapa de um deal com timestamp de entrada/saída e duração

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_stage_history_deal_id ON deal_stage_history(deal_id);
CREATE INDEX idx_deal_stage_history_stage_id ON deal_stage_history(stage_id);
CREATE INDEX idx_deal_stage_history_account_id ON deal_stage_history(account_id);

-- RLS
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_stage_history_select_account ON deal_stage_history
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY deal_stage_history_insert_account ON deal_stage_history
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

COMMENT ON TABLE deal_stage_history IS
  'Histórico de mudanças de etapa de deals. Registra tempo de entrada, saída e duração em cada etapa.';

-- Trigger: quando deal muda de etapa, fecha registro anterior e cria novo
CREATE OR REPLACE FUNCTION update_deal_stage_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Fechar registro anterior (se houver etapa antiga)
  IF OLD.stage_id IS NOT NULL AND OLD.stage_id != NEW.stage_id THEN
    UPDATE deal_stage_history
    SET
      left_at = now(),
      duration_seconds = EXTRACT(EPOCH FROM (now() - entered_at))::INTEGER
    WHERE
      deal_id = OLD.id
      AND stage_id = OLD.stage_id
      AND left_at IS NULL;
  END IF;

  -- Inserir novo registro para nova etapa
  IF NEW.stage_id IS NOT NULL AND (OLD.stage_id IS NULL OR OLD.stage_id != NEW.stage_id) THEN
    INSERT INTO deal_stage_history (deal_id, stage_id, account_id, entered_at)
    VALUES (NEW.id, NEW.stage_id, NEW.account_id, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_stage_history
AFTER UPDATE ON deals
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION update_deal_stage_history();

COMMENT ON FUNCTION update_deal_stage_history() IS
  'Trigger que registra mudanças de etapa em deal_stage_history com tempo de entrada/saída.';
