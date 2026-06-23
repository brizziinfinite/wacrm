-- ============================================================
-- 027_publik_brands.sql
-- Migra tabelas do Publik de user_id (single-tenant) para
-- account_id multi-tenant via is_account_member.
-- Nota: social_accounts já tem account_id TEXT (ID da plataforma),
-- por isso usa tenant_id como FK para accounts.
-- ============================================================

ALTER TABLE brands          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE posts            ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS tenant_id  UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE sources          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE content_assets   ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE brand_plans      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE content_ideas    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE agent_runs       ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE content_packages ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE brand_photos     ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE source_packages  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

UPDATE brands          t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE posts           t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE social_accounts t SET tenant_id  = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.tenant_id  IS NULL;
UPDATE sources         t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE content_assets  t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE brand_plans     t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE content_ideas   t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE content_packages t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE brand_photos    t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE source_packages t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE agent_runs t SET account_id = p.account_id FROM profiles p WHERE p.user_id = t.user_id AND t.account_id IS NULL;
UPDATE agent_runs t SET account_id = b.account_id FROM brands b WHERE t.brand_id = b.id AND t.account_id IS NULL;

ALTER TABLE brands          ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE posts            ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE social_accounts ALTER COLUMN tenant_id  SET NOT NULL;
ALTER TABLE sources          ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE content_assets   ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE brand_plans      ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE content_ideas    ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE agent_runs       ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE content_packages ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE brand_photos     ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE source_packages  ALTER COLUMN account_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brands_account           ON brands(account_id);
CREATE INDEX IF NOT EXISTS idx_posts_account            ON posts(account_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_tenant   ON social_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sources_account          ON sources(account_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_account   ON content_assets(account_id);
CREATE INDEX IF NOT EXISTS idx_brand_plans_account      ON brand_plans(account_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_account    ON content_ideas(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_account       ON agent_runs(account_id);
CREATE INDEX IF NOT EXISTS idx_content_packages_account ON content_packages(account_id);
CREATE INDEX IF NOT EXISTS idx_brand_photos_account     ON brand_photos(account_id);
CREATE INDEX IF NOT EXISTS idx_source_packages_account  ON source_packages(account_id);

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'brands','posts','social_accounts','sources','content_assets',
        'brand_plans','content_ideas','agent_runs','content_packages',
        'brand_photos','source_packages','visual_kits','render_formats'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY brands_select ON brands FOR SELECT USING (is_account_member(account_id));
CREATE POLICY brands_insert ON brands FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY brands_update ON brands FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY brands_delete ON brands FOR DELETE USING (is_account_member(account_id, 'admin'));

CREATE POLICY posts_select ON posts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY posts_update ON posts FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY posts_delete ON posts FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY social_accounts_select ON social_accounts FOR SELECT USING (is_account_member(tenant_id));
CREATE POLICY social_accounts_insert ON social_accounts FOR INSERT WITH CHECK (is_account_member(tenant_id, 'admin'));
CREATE POLICY social_accounts_update ON social_accounts FOR UPDATE USING (is_account_member(tenant_id, 'admin'));
CREATE POLICY social_accounts_delete ON social_accounts FOR DELETE USING (is_account_member(tenant_id, 'admin'));

CREATE POLICY sources_select ON sources FOR SELECT USING (is_account_member(account_id));
CREATE POLICY sources_insert ON sources FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY sources_update ON sources FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY sources_delete ON sources FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY content_assets_select ON content_assets FOR SELECT USING (is_account_member(account_id));
CREATE POLICY content_assets_insert ON content_assets FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY content_assets_update ON content_assets FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY content_assets_delete ON content_assets FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY brand_plans_select ON brand_plans FOR SELECT USING (is_account_member(account_id));
CREATE POLICY brand_plans_insert ON brand_plans FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY brand_plans_update ON brand_plans FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY brand_plans_delete ON brand_plans FOR DELETE USING (is_account_member(account_id, 'admin'));

CREATE POLICY content_ideas_select ON content_ideas FOR SELECT USING (is_account_member(account_id));
CREATE POLICY content_ideas_insert ON content_ideas FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY content_ideas_update ON content_ideas FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY content_ideas_delete ON content_ideas FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY agent_runs_select ON agent_runs FOR SELECT USING (is_account_member(account_id));

CREATE POLICY content_packages_select ON content_packages FOR SELECT USING (is_account_member(account_id));
CREATE POLICY content_packages_insert ON content_packages FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY content_packages_update ON content_packages FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY content_packages_delete ON content_packages FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY brand_photos_select ON brand_photos FOR SELECT USING (is_account_member(account_id));
CREATE POLICY brand_photos_insert ON brand_photos FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY brand_photos_update ON brand_photos FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY brand_photos_delete ON brand_photos FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY source_packages_select ON source_packages FOR SELECT USING (is_account_member(account_id));
CREATE POLICY source_packages_insert ON source_packages FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY source_packages_update ON source_packages FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY source_packages_delete ON source_packages FOR DELETE USING (is_account_member(account_id, 'agent'));

CREATE POLICY visual_kits_select ON visual_kits FOR SELECT USING (true);
CREATE POLICY render_formats_select ON render_formats FOR SELECT USING (true);
