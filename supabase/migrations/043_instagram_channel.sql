-- Migration 043: instagram_channel — multi-channel contacts/conversations + Instagram config
--
-- contacts.phone stays NOT NULL for backward compat with every existing
-- row and every WhatsApp code path that reads it directly. Instagram
-- contacts get a synthetic placeholder in `phone` (see webhook route)
-- and their real identity in the new `external_id` column — Instagram
-- DMs are keyed by IGSID (Instagram-scoped ID), not a phone number.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

-- One contact per (account, channel, external_id) for non-WhatsApp
-- channels. WhatsApp dedup keeps using its phone-based unique index
-- (widened below), untouched in behavior.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_channel_external_id
  ON contacts(account_id, channel, external_id)
  WHERE channel != 'whatsapp' AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_contacts_channel ON contacts(channel);

-- Migration 022's unique index is (account_id, phone_normalized) — no
-- channel in the key. phone_normalized is `regexp_replace(phone, '\D',
-- '', 'g')`; our Instagram placeholder `instagram:<igsid>` strips down
-- to just the IGSID's digits. Two Instagram contacts in the same
-- account would collide on that index today (both non-empty,
-- both digits-only), and in the pathological case an IGSID's digits
-- could coincidentally match an existing WhatsApp phone's digits.
-- Widen the key to (account_id, channel, phone_normalized) so each
-- channel dedupes independently — WhatsApp's behavior is byte-for-byte
-- unchanged since every existing row has channel='whatsapp'.
DROP INDEX IF EXISTS idx_contacts_account_phone_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_channel_phone_normalized
  ON contacts (account_id, channel, phone_normalized)
  WHERE phone_normalized <> '';

-- Instagram equivalent of whatsapp_config: one row per connected
-- Instagram professional account, scoped to an account_id (tenant).
CREATE TABLE IF NOT EXISTS instagram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_business_account_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  access_token TEXT NOT NULL, -- encrypted at rest via src/lib/whatsapp/encryption.ts (AES-256-GCM)
  verify_token TEXT NOT NULL, -- encrypted, same helper — used for GET webhook verification
  username TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_config_ig_account
  ON instagram_config(instagram_business_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_config_account_id ON instagram_config(account_id);

ALTER TABLE instagram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY instagram_config_select_account ON instagram_config
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY instagram_config_insert_account ON instagram_config
  FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY instagram_config_update_account ON instagram_config
  FOR UPDATE USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));
CREATE POLICY instagram_config_delete_account ON instagram_config
  FOR DELETE USING (is_account_member(account_id));

COMMENT ON COLUMN contacts.channel IS
  'Channel this contact was acquired on: whatsapp (default) or instagram. Drives which outbound send path (meta-api.ts vs instagram/graph-api.ts) a flow/automation uses.';
COMMENT ON COLUMN contacts.external_id IS
  'Channel-specific identity for non-WhatsApp contacts. For instagram: the IGSID (Instagram-scoped user ID). NULL for whatsapp contacts (phone is their identity).';
COMMENT ON TABLE instagram_config IS
  'Connected Instagram professional account credentials, one row per account_id. Mirrors whatsapp_config.';
