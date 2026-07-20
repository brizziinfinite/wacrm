import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendText, mockSendInstagram } = vi.hoisted(() => ({
  mockSendText: vi.fn().mockResolvedValue({ messageId: 'wamid.123' }),
  mockSendInstagram: vi.fn().mockResolvedValue({ messageId: 'mid.456' }),
}))

vi.mock('@/lib/whatsapp/meta-api', () => ({
  sendTextMessage: mockSendText,
  sendTemplateMessage: vi.fn(),
}))
vi.mock('@/lib/instagram/graph-api', () => ({
  sendInstagramTextAndLog: mockSendInstagram,
}))
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => v.replace('encrypted-', ''),
}))

const rows: Record<string, unknown> = {
  contacts: null,
  whatsapp_config: null,
  instagram_config: null,
}

const mockDb = {
  from: vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows.contacts, error: null }) }),
        maybeSingle: () => Promise.resolve({ data: rows.contacts, error: null }),
        single: () =>
          Promise.resolve({
            data: table === 'whatsapp_config' ? rows.whatsapp_config : rows.instagram_config,
            error: null,
          }),
      }),
    }),
    insert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  })),
}

vi.mock('./admin-client', () => ({ supabaseAdmin: () => mockDb }))

import { engineSendText } from './meta-send'

describe('engineSendText channel routing', () => {
  beforeEach(() => {
    mockSendText.mockClear()
    mockSendInstagram.mockClear()
  })

  it('sends via WhatsApp Meta API when contact.channel is whatsapp', async () => {
    rows.contacts = { id: 'c1', phone: '+5511999998888', channel: 'whatsapp', external_id: null }
    rows.whatsapp_config = { phone_number_id: 'pn1', access_token: 'encrypted-tok' }

    const result = await engineSendText({
      accountId: 'acc1',
      userId: 'u1',
      conversationId: 'conv1',
      contactId: 'c1',
      text: 'oi',
    })

    expect(mockSendText).toHaveBeenCalledTimes(1)
    expect(mockSendInstagram).not.toHaveBeenCalled()
    expect(result.whatsapp_message_id).toBe('wamid.123')
  })

  it('sends via Instagram Graph API when contact.channel is instagram', async () => {
    rows.contacts = { id: 'c2', phone: 'instagram:999', channel: 'instagram', external_id: '999' }
    rows.instagram_config = { access_token: 'encrypted-ig-tok' }

    const result = await engineSendText({
      accountId: 'acc1',
      userId: 'u1',
      conversationId: 'conv2',
      contactId: 'c2',
      text: 'oi ig',
    })

    expect(mockSendInstagram).toHaveBeenCalledTimes(1)
    expect(mockSendText).not.toHaveBeenCalled()
    expect(mockSendInstagram.mock.calls[0][0]).toMatchObject({
      accountId: 'acc1',
      conversationId: 'conv2',
      igsid: '999',
      text: 'oi ig',
    })
    expect(result.whatsapp_message_id).toBe('mid.456')
  })
})
