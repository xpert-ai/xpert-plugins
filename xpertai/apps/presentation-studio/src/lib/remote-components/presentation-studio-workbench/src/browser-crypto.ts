import { sha256 } from 'js-sha256'

export interface BrowserCryptoCapabilities {
  readonly subtle?: {
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>
  }
  randomUUID?(): string
  getRandomValues?(array: Uint8Array): Uint8Array
}

export async function sha256Hex(value: string, capabilities = browserCryptoCapabilities()) {
  const bytes = new TextEncoder().encode(value)
  if (!capabilities?.subtle) return sha256(bytes)

  const digest = await capabilities.subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

export function createUuid(capabilities = browserCryptoCapabilities()) {
  if (capabilities?.randomUUID) return capabilities.randomUUID()
  if (!capabilities?.getRandomValues) {
    throw new Error('This browser cannot generate secure presentation identifiers.')
  }

  const bytes = capabilities.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function browserCryptoCapabilities(): BrowserCryptoCapabilities | undefined {
  return typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
