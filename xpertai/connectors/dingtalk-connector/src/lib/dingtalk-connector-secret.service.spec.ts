import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { DingTalkConnectorSecretService } from './dingtalk-connector-secret.service.js'

describe('DingTalkConnectorSecretService', () => {
  const encryptionKey = 'dingtalk-connector-test-encryption-key'

  it('decrypts the encrypted client secret format used by DingTalk system integrations', () => {
    const service = new DingTalkConnectorSecretService(configService())

    expect(service.decrypt(encrypt('system-secret'))).toBe('system-secret')
  })

  it('rejects a plaintext client secret', () => {
    const service = new DingTalkConnectorSecretService(configService())

    expect(() => service.decrypt('system-secret')).toThrow('is not encrypted')
  })

  function configService() {
    return {
      get: jest.fn((key: string) => (key === 'SECRETS_ENCRYPTION_KEY' ? encryptionKey : undefined))
    } as never
  }

  function encrypt(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(encryptionKey).digest(), iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return `enc:v1:${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64')}`
  }
})
