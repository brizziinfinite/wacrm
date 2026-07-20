import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/whatsapp/encryption'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET /api/instagram/config
 *
 * Returns the saved config (never the decrypted token) plus whether
 * it's currently marked active.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { connected: false, reason: 'no_account', message: 'Your profile is not linked to an account.' },
        { status: 200 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('instagram_config')
      .select('id, instagram_business_account_id, page_id, username, is_active')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching instagram_config:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 },
      )
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: 'no_config', message: 'No Instagram configuration saved yet.' },
        { status: 200 },
      )
    }

    return NextResponse.json({ connected: config.is_active, config })
  } catch (error) {
    console.error('Error in Instagram config GET:', error)
    return NextResponse.json({ connected: false, reason: 'unknown', message: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/instagram/config
 *
 * Saves or updates the Instagram config for the authenticated user's
 * account. No live Meta verification step (unlike WhatsApp's
 * verifyPhoneNumber) — there's no equivalent "check this page token is
 * valid" call that doesn't require an existing IGSID to target, so the
 * token is trusted at save time and only proven live once a real DM
 * exercises the webhook.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const body = await request.json()
    const { instagram_business_account_id, page_id, access_token, verify_token, username } = body

    if (!instagram_business_account_id || !page_id || !access_token || !verify_token) {
      return NextResponse.json(
        { error: 'instagram_business_account_id, page_id, access_token and verify_token are required' },
        { status: 400 },
      )
    }

    // Reject if another account already claimed this IG business account —
    // same single-tenant-per-number reasoning as whatsapp_config.phone_number_id.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('instagram_config')
      .select('account_id')
      .eq('instagram_business_account_id', instagram_business_account_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking instagram_business_account_id ownership:', claimedError)
      return NextResponse.json({ error: 'Failed to validate configuration' }, { status: 500 })
    }

    if (claimed) {
      return NextResponse.json(
        { error: 'This Instagram account is already linked to another account on this instance.' },
        { status: 409 },
      )
    }

    let encryptedAccessToken: string
    let encryptedVerifyToken: string
    try {
      encryptedAccessToken = encrypt(access_token)
      encryptedVerifyToken = encrypt(verify_token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        { error: 'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string.' },
        { status: 500 },
      )
    }

    const { data: existing } = await supabase
      .from('instagram_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    const baseRow = {
      instagram_business_account_id,
      page_id,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      username: username || null,
      is_active: true,
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('instagram_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('Error updating instagram_config:', updateError)
        return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabase
        .from('instagram_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting instagram_config:', insertError)
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, saved: true })
  } catch (error) {
    console.error('Error in Instagram config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/instagram/config
 *
 * Removes the authenticated account's Instagram configuration row.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('instagram_config')
      .delete()
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting instagram_config:', deleteError)
      return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in Instagram config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
