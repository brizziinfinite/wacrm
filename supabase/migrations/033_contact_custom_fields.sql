-- Migration 033: contact_custom_fields — campos customizados por conta
-- CPF, CNPJ, segmento, valor estimado, etc.

CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_custom_fields_contact_id ON contact_custom_fields(contact_id);
CREATE INDEX idx_contact_custom_fields_account_id ON contact_custom_fields(account_id);
CREATE INDEX idx_contact_custom_fields_name ON contact_custom_fields(name);

-- RLS
ALTER TABLE contact_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_custom_fields_select_account ON contact_custom_fields
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY contact_custom_fields_insert_account ON contact_custom_fields
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY contact_custom_fields_update_account ON contact_custom_fields
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY contact_custom_fields_delete_account ON contact_custom_fields
  FOR DELETE
  USING (is_account_member(account_id));

COMMENT ON TABLE contact_custom_fields IS
  'Campos customizados de contato. CPF, CNPJ, segmento, valor estimado, etc.';

COMMENT ON COLUMN contact_custom_fields.name IS
  'Nome do campo. Ex: CPF, CNPJ, Segmento, Valor Estimado.';

COMMENT ON COLUMN contact_custom_fields.value IS
  'Valor do campo. Pode ser nulo.';
