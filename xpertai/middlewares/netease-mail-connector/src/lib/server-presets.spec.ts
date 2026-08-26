import { NeteaseMailError } from './errors.js'
import {
  createNeteaseMailCredential,
  NETEASE_MAIL_SERVER_PRESETS,
  normalizeEmail,
  resolveProviderKey
} from './server-presets.js'

describe('NetEase Mail server presets', () => {
  it.each([
    ['user@163.com', '163', 'imap.163.com', 'smtp.163.com'],
    ['user@126.com', '126', 'imap.126.com', 'smtp.126.com'],
    ['user@yeah.net', 'yeah', 'imap.yeah.net', 'smtp.yeah.net']
  ] as const)('allowlists %s', (email, provider, imapHost, smtpHost) => {
    expect(resolveProviderKey(email)).toBe(provider)
    expect(NETEASE_MAIL_SERVER_PRESETS[provider]).toMatchObject({
      imap: { host: imapHost, port: 993 },
      smtp: { host: smtpHost, port: 465 }
    })
  })

  it('normalizes only the domain and trims authorization codes', () => {
    expect(normalizeEmail('  User.Name@163.COM ')).toBe('User.Name@163.com')
    expect(createNeteaseMailCredential('User@126.COM', '  auth-code  ')).toEqual({
      email: 'User@126.com',
      authorizationCode: 'auth-code',
      providerPreset: '126'
    })
  })

  it('rejects unsupported providers before any network access', () => {
    expect(() => createNeteaseMailCredential('user@example.com', 'auth-code')).toThrow(NeteaseMailError)
    expect(() => createNeteaseMailCredential('user@example.com', 'auth-code')).toThrow('MAIL_PROVIDER_UNSUPPORTED')
  })
})
