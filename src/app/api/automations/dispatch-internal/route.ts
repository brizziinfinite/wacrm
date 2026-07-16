import { NextResponse } from 'next/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import type { AutomationTriggerType } from '@/types'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accountId, triggerType, contactId, context } = await req.json() as {
    accountId: string
    triggerType: AutomationTriggerType
    contactId?: string | null
    context?: { vars?: Record<string, unknown> }
  }

  if (!accountId || !triggerType) {
    return NextResponse.json({ error: 'Missing accountId or triggerType' }, { status: 400 })
  }

  await runAutomationsForTrigger({ accountId, triggerType, contactId, context })
  return NextResponse.json({ ok: true })
}
