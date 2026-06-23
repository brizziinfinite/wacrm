# Melhorias — wacrm + Publik Fusion

## Status Geral

Produto: CRM WhatsApp + Plataforma de Conteúdo AI (fusão wacrm + Publik)
Base: `/Users/brizzi/wacrm/wacrm`
Banco: Supabase projeto Publik (`xnwcalrlvjwszmtgkwfs`)

---

## Concluído

### Banco de Dados
- [x] Migrations 001-026 wacrm aplicadas no banco Publik
- [x] Migration 027 — tabelas Publik migradas para `account_id` multi-tenant
- [x] `profiles` adaptado (adicionado `user_id`, `account_id`, `account_role`)
- [x] `is_account_member()` SECURITY DEFINER ativa em todas as tabelas
- [x] `accounts` table com backfill — 1 conta criada
- [x] `.env.local` criado (falta apenas `SUPABASE_SERVICE_ROLE_KEY`)

### Infraestrutura
- [x] Decisão arquitetural: base = wacrm, módulo = Publik
- [x] 42 tabelas no banco, todas com RLS multi-tenant

---

## Pendências

### Configuração (Bloqueante)
- [ ] Preencher `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`
  - Pegar em: Supabase → projeto Publik → Project Settings → API → service_role
- [ ] Testar `npm run dev` no wacrm

### Fase 3 — Rotas Next.js
- [ ] `/brands` — listagem e criação de marcas
- [ ] `/ideas` — ideias de conteúdo
- [ ] `/packages` — pacotes de conteúdo
- [ ] `/posts` — calendário de posts
- [ ] `/sources` — fontes de conteúdo
- [ ] `/calendar` — calendário editorial

### Fase 4 — Componentes
- [ ] Copiar componentes do PUBLIK (`/Users/brizzi/PUBLIK/components/`)
- [ ] Adaptar: `user_id` → `account_id` em todos os componentes
- [ ] Brand switcher (Zustand ou Context)
- [ ] Brand Wizard (4 steps)

### Fase 5 — Sidebar
- [ ] Unificar sidebar wacrm com seção "Conteúdo" (Publik)
- [ ] navItems: Dashboard, Inbox, Contacts, Pipelines, Broadcasts, Automations, Flows | Brands, Ideias, Pacotes, Posts, Calendário, Fontes

### Fase 6 — Edge Functions
- [ ] Copiar `agent-1-strategist` do PUBLIK → adaptar `user_id` → `account_id`
- [ ] Copiar `agent-2-roteirista` → adaptar
- [ ] Copiar `publish-scheduled-posts` → adaptar
- [ ] Copiar `_shared/llm-retry.ts`
- [ ] Deploy todas as Edge Functions no projeto Publik

### Fase 7 — Integrações CRM + Conteúdo
- [ ] Conversations → Sources (transcrição de conversa vira fonte de conteúdo)
- [ ] Contacts → audience de Broadcast
- [ ] Content Package → WhatsApp Broadcast

### Fase 8 — Dependências npm
- [ ] Adicionar ao wacrm: `zustand`, `framer-motion`, `react-hook-form`, `@hookform/resolvers`, `react-day-picker`, `next-themes`

---

## Decisões Técnicas

- **Banco:** Reusar projeto Supabase do Publik (não criar novo)
- **`social_accounts.account_id`:** coluna TEXT existente = ID da plataforma; FK para `accounts` usa `tenant_id`
- **`profiles`:** estrutura híbrida — `id = auth.uid()` (Publik) + `user_id` (wacrm)
- **Edge Functions:** BullMQ/Redis do Publik será migrado para Supabase Edge Functions puras
