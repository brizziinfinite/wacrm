-- Migration 036: chatbot_menus — menu com árvore de opções
-- Qualifica lead antes de chegar no atendente

CREATE TABLE IF NOT EXISTS chatbot_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! Como posso ajudar?',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_menus_account_id ON chatbot_menus(account_id);
CREATE INDEX idx_chatbot_menus_active ON chatbot_menus(active);

-- Opções do menu (árvore)
CREATE TABLE IF NOT EXISTS chatbot_menu_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES chatbot_menus(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES chatbot_menu_options(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- "1️⃣ Vendas", "2️⃣ Suporte"
  response_text TEXT NOT NULL, -- Mensagem ao selecionar esta opção
  route_to_department TEXT, -- Departamento/atendente (ex: "vendas", "suporte")
  order_index INTEGER DEFAULT 0,
  is_leaf BOOLEAN DEFAULT true, -- false = tem submenu
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_menu_options_menu_id ON chatbot_menu_options(menu_id);
CREATE INDEX idx_chatbot_menu_options_parent_id ON chatbot_menu_options(parent_id);
CREATE INDEX idx_chatbot_menu_options_account_id ON chatbot_menu_options(account_id);

-- RLS
ALTER TABLE chatbot_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY chatbot_menus_select_account ON chatbot_menus
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY chatbot_menus_insert_account ON chatbot_menus
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY chatbot_menus_update_account ON chatbot_menus
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY chatbot_menus_delete_account ON chatbot_menus
  FOR DELETE
  USING (is_account_member(account_id));

ALTER TABLE chatbot_menu_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY chatbot_menu_options_select_account ON chatbot_menu_options
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY chatbot_menu_options_insert_account ON chatbot_menu_options
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY chatbot_menu_options_update_account ON chatbot_menu_options
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY chatbot_menu_options_delete_account ON chatbot_menu_options
  FOR DELETE
  USING (is_account_member(account_id));

COMMENT ON TABLE chatbot_menus IS
  'Menus de chatbot com árvore de opções. Qualifica lead antes de atendente.';

COMMENT ON TABLE chatbot_menu_options IS
  'Opções dentro de um menu. Recursivo com parent_id para criar árvore.';

COMMENT ON COLUMN chatbot_menu_options.parent_id IS
  'NULL = opção raiz. Presente = submenu desta opção.';

COMMENT ON COLUMN chatbot_menu_options.is_leaf IS
  'true = encaminha para atendente. false = mostra submenu.';

COMMENT ON COLUMN chatbot_menu_options.route_to_department IS
  'Departamento para rotear. NULL = mostrar submenu.';
