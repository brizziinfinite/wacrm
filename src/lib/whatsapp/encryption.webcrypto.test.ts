import { describe, it, expect } from 'vitest'

// encryption.ts reads process.env.ENCRYPTION_KEY at module top-level, so
// the env var must be set before the module is imported — set it first,
// then dynamic-import.
const keyHex = 'a'.repeat(64)
process.env.ENCRYPTION_KEY = keyHex
const { encrypt } = await import('./encryption')

// Verifies the Web Crypto decryptToken() reimplementation duplicated by
// hand into supabase/functions/qualify-lead/index.ts and
// process-ai-messages/index.ts (Deno edge functions can't import
// src/lib/whatsapp/encryption.ts's Node crypto). Those files have no
// local runner (no Deno CLI, tests there mock fetch/never execute this
// path) — this is the one place the exact algorithm gets exercised
// against real ciphertext from the real encrypt().

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// Exact copy of decryptToken() from the edge functions (minus Deno.env,
// key passed directly) — any future edit to the edge-function version
// should be mirrored here too.
async function decryptToken(encrypted: string, keyHex: string): Promise<string | undefined> {
  try {
    const [ivHex, ciphertextHex, authTagHex] = encrypted.split(':')
    const keyBytes = hexToBytes(keyHex)
    const iv = hexToBytes(ivHex)
    const authTag = hexToBytes(authTagHex)
    const ciphertext = hexToBytes(ciphertextHex)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    )
    const combined = new Uint8Array(ciphertext.length + authTag.length)
    combined.set(ciphertext)
    combined.set(authTag, ciphertext.length)

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      cryptoKey,
      combined as BufferSource,
    )
    return new TextDecoder().decode(plaintext)
  } catch (err) {
    console.error('decrypt failed:', err)
    return undefined
  }
}

describe('decryptToken (Web Crypto) round-trips with src/lib/whatsapp/encryption.ts encrypt()', () => {
  it('decrypts a token encrypted by the real Node encrypt()', async () => {
    const original = 'EAAGm0PX4ZCpsBO1234567890abcdefTESTTOKEN'
    const encrypted = encrypt(original)

    const decrypted = await decryptToken(encrypted, keyHex)

    expect(decrypted).toBe(original)
  })

  it('round-trips unicode text', async () => {
    const original = 'token-com-açentuação-é-ç-🔑'
    const encrypted = encrypt(original)

    const decrypted = await decryptToken(encrypted, keyHex)

    expect(decrypted).toBe(original)
  })
})
