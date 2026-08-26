import { NeteaseMailError } from './errors.js'
import type { NeteaseMailCredential, NeteaseMailProviderKey, NeteaseMailServerPreset } from './types.js'

export const NETEASE_MAIL_SERVER_PRESETS: Record<NeteaseMailProviderKey, NeteaseMailServerPreset> = {
  '163': {
    key: '163',
    domain: '163.com',
    label: 'NetEase 163 Mail',
    imap: { host: 'imap.163.com', port: 993 },
    smtp: { host: 'smtp.163.com', port: 465 }
  },
  '126': {
    key: '126',
    domain: '126.com',
    label: 'NetEase 126 Mail',
    imap: { host: 'imap.126.com', port: 993 },
    smtp: { host: 'smtp.126.com', port: 465 }
  },
  yeah: {
    key: 'yeah',
    domain: 'yeah.net',
    label: 'NetEase Yeah Mail',
    imap: { host: 'imap.yeah.net', port: 993 },
    smtp: { host: 'smtp.yeah.net', port: 465 }
  }
}

const PROVIDER_BY_DOMAIN = new Map(
  Object.values(NETEASE_MAIL_SERVER_PRESETS).map((preset) => [preset.domain, preset.key] as const)
)

export function createNeteaseMailCredential(emailValue: string, authorizationCodeValue: string): NeteaseMailCredential {
  const email = normalizeEmail(emailValue)
  const authorizationCode = authorizationCodeValue.trim()
  if (authorizationCode.length < 6 || authorizationCode.length > 256) {
    throw new NeteaseMailError('MAIL_AUTH_FAILED', 'A valid NetEase Mail client authorization code is required.')
  }

  return {
    email,
    authorizationCode,
    providerPreset: resolveProviderKey(email)
  }
}

export function resolveNeteaseMailPreset(provider: NeteaseMailProviderKey): NeteaseMailServerPreset {
  return NETEASE_MAIL_SERVER_PRESETS[provider]
}

export function resolveProviderKey(email: string): NeteaseMailProviderKey {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  const provider = PROVIDER_BY_DOMAIN.get(domain)
  if (!provider) {
    throw new NeteaseMailError(
      'MAIL_PROVIDER_UNSUPPORTED',
      'This connector supports 163.com, 126.com, and yeah.net mailboxes.'
    )
  }
  return provider
}

export function normalizeEmail(value: string): string {
  const email = value.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new NeteaseMailError('MAIL_AUTH_FAILED', 'A valid full mailbox address is required.')
  }
  const at = email.lastIndexOf('@')
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`
}

export function readRequiredCredentialString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NeteaseMailError('MAIL_AUTH_FAILED', `${name} is required.`)
  }
  return value
}
