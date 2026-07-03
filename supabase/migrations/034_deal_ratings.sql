-- Migration 034: deal_ratings — NPS e avaliações de deals
-- Feedback de qualidade ao fechar deal (won/lost)

CREATE TABLE IF NOT EXISTS deal_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rate INTEGER NOT NULL CHECK (rate >= 1 AND rate <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_ratings_deal_id ON deal_ratings(deal_id);
CREATE INDEX idx_deal_ratings_contact_id ON deal_ratings(contact_id);
CREATE INDEX idx_deal_ratings_user_id ON deal_ratings(user_id);
CREATE INDEX idx_deal_ratings_account_id ON deal_ratings(account_id);
CREATE INDEX idx_deal_ratings_created_at ON deal_ratings(created_at DESC);

-- RLS
ALTER TABLE deal_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_ratings_select_account ON deal_ratings
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY deal_ratings_insert_account ON deal_ratings
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

COMMENT ON TABLE deal_ratings IS
  'Avaliações de deals. NPS ao fechar (won/lost). Rate 1-5, comentário opcional.';

COMMENT ON COLUMN deal_ratings.rate IS
  'Avaliação de 1 (ruim) a 5 (excelente).';

COMMENT ON COLUMN deal_ratings.comment IS
  'Comentário opcional do cliente sobre o atendimento.';

-- Tabela auxiliar: deal_rating_requests
-- Rastreia quais deals já tiveram avaliação enviada (para não enviar duplicada)
CREATE TABLE IF NOT EXISTS deal_rating_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, sent, responded, expired
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_rating_requests_deal_id ON deal_rating_requests(deal_id);
CREATE INDEX idx_deal_rating_requests_account_id ON deal_rating_requests(account_id);
CREATE INDEX idx_deal_rating_requests_status ON deal_rating_requests(status);

ALTER TABLE deal_rating_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_rating_requests_select_account ON deal_rating_requests
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY deal_rating_requests_insert_account ON deal_rating_requests
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

COMMENT ON TABLE deal_rating_requests IS
  'Requisições de avaliação enviadas. Rastreia status: pending, sent, responded, expired.';
