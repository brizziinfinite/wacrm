import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the account-resolution helper — GET/PUT only need `accountId` and
// `supabase` out of the returned context. `toErrorResponse` is the real
// implementation so a thrown UnauthorizedError/ForbiddenError still maps
// to the right status code.
const getCurrentAccount = vi.fn()
vi.mock('@/lib/auth/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/account')>()
  return {
    ...actual,
    getCurrentAccount: () => getCurrentAccount(),
  }
})

// Import AFTER the mock is registered.
const { GET, PUT } = await import('./route')
const { UnauthorizedError } = await import('@/lib/auth/account')

const ACCOUNT_ID = 'acct-1'

/** Minimal chainable Supabase mock covering the two query shapes the route uses. */
function makeSupabase(opts: {
  selectResult?: { data: unknown; error: unknown }
  upsertResult?: { data: unknown; error: unknown }
}) {
  const eq = vi.fn().mockReturnThis()
  const maybeSingle = vi.fn().mockResolvedValue(
    opts.selectResult ?? { data: null, error: null },
  )
  const selectAfterUpsert = vi.fn().mockReturnThis()
  const single = vi.fn().mockResolvedValue(
    opts.upsertResult ?? { data: null, error: null },
  )
  const upsert = vi.fn().mockReturnValue({ select: selectAfterUpsert, single })
  const select = vi.fn().mockReturnValue({ eq, maybeSingle })
  const from = vi.fn().mockReturnValue({ select, eq, maybeSingle, upsert })

  return { from, _upsert: upsert }
}

function req(body: unknown): Request {
  return new Request('https://crm.example.com/api/ai-qualifier/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getCurrentAccount.mockReset()
})

describe('GET /api/ai-qualifier/config', () => {
  it('propagates auth errors via toErrorResponse (401 when unauthenticated)', async () => {
    getCurrentAccount.mockRejectedValue(new UnauthorizedError())
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns null when the account has no config yet', async () => {
    const supabase = makeSupabase({ selectResult: { data: null, error: null } })
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('ai_qualifier_configs')
  })

  it('returns the existing config row', async () => {
    const row = { id: 'cfg-1', account_id: ACCOUNT_ID, enabled: true }
    const supabase = makeSupabase({ selectResult: { data: row, error: null } })
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(row)
  })

  it('500s when the query errors', async () => {
    const supabase = makeSupabase({ selectResult: { data: null, error: { message: 'boom' } } })
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase })

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/ai-qualifier/config', () => {
  it('propagates auth errors via toErrorResponse (401 when unauthenticated)', async () => {
    getCurrentAccount.mockRejectedValue(new UnauthorizedError())
    const res = await PUT(req({ enabled: true }))
    expect(res.status).toBe(401)
  })

  it('upserts keyed on the caller account_id, ignoring any client-supplied account_id', async () => {
    const savedRow = { id: 'cfg-1', account_id: ACCOUNT_ID, enabled: true, model: 'gemini-2.5-flash' }
    const supabase = makeSupabase({ upsertResult: { data: savedRow, error: null } })
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase })

    const res = await PUT(req({ enabled: true, account_id: 'someone-elses-account' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(savedRow)
    expect(supabase._upsert).toHaveBeenCalledWith(
      { account_id: ACCOUNT_ID, enabled: true },
      { onConflict: 'account_id' },
    )
  })

  it('400s on invalid JSON body', async () => {
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase: makeSupabase({}) })
    const badReq = new Request('https://crm.example.com/api/ai-qualifier/config', {
      method: 'PUT',
      body: 'not json',
    })
    const res = await PUT(badReq)
    expect(res.status).toBe(400)
  })

  it('500s when the upsert errors', async () => {
    const supabase = makeSupabase({ upsertResult: { data: null, error: { message: 'boom' } } })
    getCurrentAccount.mockResolvedValue({ accountId: ACCOUNT_ID, supabase })

    const res = await PUT(req({ enabled: true }))
    expect(res.status).toBe(500)
  })
})
