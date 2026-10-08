import { QqMailProtocolError } from './errors.js'
import type { QqMailProtocolCredential } from './types.js'

export function createQqMailProtocolCredential(
  emailValue: string,
  authorizationCodeValue: string
): QqMailProtocolCredential {
  const email = normalizeQqMailAddress(emailValue)
  const authorizationCode = authorizationCodeValue.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9]{16}$/.test(authorizationCode)) {
    throw new QqMailProtocolError(
      'MAIL_AUTH_FAILED',
      'QQ Mail requires the 16-character IMAP/SMTP authorization code, not the QQ account password.'
    )
  }
  return { email, authorizationCode }
}

export function normalizeQqMailAddress(value: string): string {
  const email = value.trim()
  if (email.length > 254 || !/^[^\s@]+@(?:qq\.com|foxmail\.com)$/i.test(email)) {
    throw new QqMailProtocolError(
      'MAIL_AUTH_FAILED',
      'Enter the full QQ Mail address ending in @qq.com or @foxmail.com.'
    )
  }
  const at = email.lastIndexOf('@')
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`
}

export function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new QqMailProtocolError('MAIL_AUTH_FAILED', `${name} is required.`)
  }
  return value
}
