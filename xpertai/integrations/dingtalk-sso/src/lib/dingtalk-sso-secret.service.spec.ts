import { DingTalkSsoSecretService } from './dingtalk-sso-secret.service.js'

describe('DingTalkSsoSecretService', () => {
  const config = (key?: string) => ({
    get: jest.fn((name: string) => name === 'SECRETS_ENCRYPTION_KEY' ? key : undefined)
  })

  it('encrypts and decrypts a client secret', () => {
    const service = new DingTalkSsoSecretService(config('stable-production-key') as any)
    const encrypted = service.encrypt('ding-secret')
    expect(encrypted).toMatch(/^enc:v1:/)
    expect(service.decrypt(encrypted)).toBe('ding-secret')
  })

  it('rejects plaintext and insecure encryption keys', () => {
    const service = new DingTalkSsoSecretService(config('stable-production-key') as any)
    expect(() => service.decrypt('ding-secret')).toThrow(/not encrypted/i)
    expect(() => new DingTalkSsoSecretService(config() as any).encrypt('ding-secret')).toThrow(/SECRETS_ENCRYPTION_KEY/)
    expect(() => new DingTalkSsoSecretService(config('default_secrets_encryption_key') as any).encrypt('ding-secret')).toThrow(/non-default/)
  })
})
