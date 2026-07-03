-- Migration 039: radar_opportunities — monitora notícias + concorrentes
-- Sugere pauta baseada em trends

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'rss', 'google_news', 'twitter', 'g1', 'reddit'
  source_url TEXT NOT NULL,
  source_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_opportunity_sources_brand_id ON opportunity_sources(brand_id);
CREATE INDEX idx_opportunity_sources_account_id ON opportunity_sources(account_id);
CREATE INDEX idx_opportunity_sources_active ON opportunity_sources(active);

-- Oportunidades encontradas
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source_id UUID REFERENCES opportunity_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  relevance_score FLOAT DEFAULT 0, -- 0-1, quanto relevante para o brand
  suggested_angle TEXT,
  suggested_format TEXT, -- reel, carrossel, post, blog
  urgency TEXT DEFAULT 'normal', -- low, normal, high, trending
  source_content JSONB, -- raw item (título, descrição, link original)
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected, published
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by_scan_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_opportunities_brand_id ON opportunities(brand_id);
CREATE INDEX idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_created_at ON opportunities(created_at DESC);
CREATE INDEX idx_opportunities_relevance ON opportunities(relevance_score DESC);

-- Radar config por account
CREATE TABLE IF NOT EXISTS radar_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  scan_time TEXT DEFAULT '08:00', -- cron time (HH:MM UTC)
  min_relevance_score FLOAT DEFAULT 0.5, -- filtrar abaixo disso
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_radar_configs_account_id ON radar_configs(account_id);

-- RLS
ALTER TABLE opportunity_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_sources_select_account ON opportunity_sources
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY opportunity_sources_insert_account ON opportunity_sources
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY opportunity_sources_update_account ON opportunity_sources
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY opportunity_sources_delete_account ON opportunity_sources
  FOR DELETE
  USING (is_account_member(account_id));

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunities_select_account ON opportunities
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY opportunities_insert_account ON opportunities
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY opportunities_update_account ON opportunities
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

ALTER TABLE radar_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY radar_configs_select_account ON radar_configs
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY radar_configs_insert_account ON radar_configs
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY radar_configs_update_account ON radar_configs
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

COMMENT ON TABLE opportunity_sources IS
  'Fontes de oportunidades (RSS, Google News, Twitter, etc). Configurado por brand.';

COMMENT ON TABLE opportunities IS
  'Oportunidades encontradas pelo Radar. Status: pending, accepted, rejected, published.';

COMMENT ON COLUMN opportunities.relevance_score IS
  'Score 0-1 de relevância para o brand. Calculado por LLM.';

COMMENT ON COLUMN opportunities.suggested_format IS
  'Formato recomendado: reel, carrossel, post, blog. Gerado por LLM.';

COMMENT ON COLUMN opportunities.urgency IS
  'Urgência: low, normal, high, trending. Indica trending agora.';

COMMENT ON TABLE radar_configs IS
  'Configuração do Radar por account. Horário de scan e score mínimo.';
