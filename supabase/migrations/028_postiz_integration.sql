ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS postiz_integration_id TEXT,
  ADD COLUMN IF NOT EXISTS postiz_username TEXT;

CREATE INDEX IF NOT EXISTS idx_social_accounts_postiz ON social_accounts(postiz_integration_id) WHERE postiz_integration_id IS NOT NULL;
