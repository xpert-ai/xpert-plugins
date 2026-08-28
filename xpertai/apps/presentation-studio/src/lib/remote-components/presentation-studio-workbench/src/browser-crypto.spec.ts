import { createUuid, sha256Hex, type BrowserCryptoCapabilities } from './browser-crypto'

describe('Presentation Studio browser crypto compatibility', () => {
  it('hashes through the JavaScript fallback when SubtleCrypto is unavailable', async () => {
    await expect(sha256Hex('abc', {})).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    await expect(sha256Hex('演示文稿', {})).resolves.toBe(
      '54f9826310400f0089e0ed37d26c71bcf992f74989bec6981976ecb1eabc02ae'
    )
  })

  it('keeps the native SubtleCrypto path when it is available', async () => {
    const digest = jest.fn(async () => Uint8Array.from([0xab, 0xcd]).buffer)

    await expect(sha256Hex('native', { subtle: { digest } })).resolves.toBe('abcd')
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array))
  })

  it('prefers the native UUID implementation', () => {
    const randomUUID = jest.fn(() => 'native-uuid')
    const getRandomValues = jest.fn((bytes: Uint8Array) => bytes)

    expect(createUuid({ randomUUID, getRandomValues })).toBe('native-uuid')
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  it('creates an RFC 4122 v4 UUID from getRandomValues on insecure HTTP pages', () => {
    const capabilities: BrowserCryptoCapabilities = {
      getRandomValues(bytes) {
        bytes.set(Array.from({ length: 16 }, (_value, index) => index))
        return bytes
      }
    }

    expect(createUuid(capabilities)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('fails clearly when no secure random source exists', () => {
    expect(() => createUuid({})).toThrow('cannot generate secure presentation identifiers')
  })
})
