import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import type { AiQualifierConfig } from '@/types'

/**
 * GET /api/ai-qualifier/config
 *
 * Returns the caller's account AI qualifier config, or `null` if the
 * account hasn't configured one yet (migration 042 has no default row
 * per account — it's created lazily on first PUT).
 */
export async function GET() {
  let accountId: string
  let supabase: Awaited<ReturnType<typeof getCurrentAccount>>['supabase']
  try {
    const ctx = await getCurrentAccount()
    accountId = ctx.accountId
    supabase = ctx.supabase
  } catch (err) {
    return toErrorResponse(err)
  }

  const { data, error } = await supabase
    .from('ai_qualifier_configs')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as AiQualifierConfig | null)
}

/**
 * PUT /api/ai-qualifier/config
 *
 * Upserts the caller's account AI qualifier config, keyed on
 * `account_id` (migration 042's `idx_ai_qualifier_configs_account_id`
 * UNIQUE index) — one config per account.
 */
export async function PUT(request: Request) {
  let accountId: string
  let supabase: Awaited<ReturnType<typeof getCurrentAccount>>['supabase']
  try {
    const ctx = await getCurrentAccount()
    accountId = ctx.accountId
    supabase = ctx.supabase
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // account_id is always the caller's own — never trust a client-supplied
  // value, and id/created_at/updated_at are DB-managed. Only pull the
  // fields that are actually writable off the body.
  const {
    enabled,
    questions,
    qualify_prompt,
    hot_pipeline_id,
    hot_stage_id,
    hot_tag_id,
    warm_tag_id,
    cold_tag_id,
    model,
    temperature,
  } = body as Partial<AiQualifierConfig>

  const patch: Record<string, unknown> = { account_id: accountId }
  if (enabled !== undefined) patch.enabled = enabled
  if (questions !== undefined) patch.questions = questions
  if (qualify_prompt !== undefined) patch.qualify_prompt = qualify_prompt
  if (hot_pipeline_id !== undefined) patch.hot_pipeline_id = hot_pipeline_id
  if (hot_stage_id !== undefined) patch.hot_stage_id = hot_stage_id
  if (hot_tag_id !== undefined) patch.hot_tag_id = hot_tag_id
  if (warm_tag_id !== undefined) patch.warm_tag_id = warm_tag_id
  if (cold_tag_id !== undefined) patch.cold_tag_id = cold_tag_id
  if (model !== undefined) patch.model = model
  if (temperature !== undefined) patch.temperature = temperature

  const { data, error } = await supabase
    .from('ai_qualifier_configs')
    .upsert(patch, { onConflict: 'account_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as AiQualifierConfig)
}
