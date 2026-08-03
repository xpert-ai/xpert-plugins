import { ConfigService } from '@nestjs/config'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'

describe('GitHubSsoSecretService', () => {
  it('encrypts the client secret at rest and decrypts it for OAuth only', () => {
    const service = new GitHubSsoSecretService(
      new ConfigService({
        SECRETS_ENCRYPTION_KEY: 'test-encryption-key'
      })
    )

    const encrypted = service.encrypt('github-client-secret')

    expect(encrypted).toMatch(/^enc:v1:/)
    expect(encrypted).not.toContain('github-client-secret')
    expect(service.decrypt(encrypted)).toBe('github-client-secret')
    expect(service.encrypt(encrypted)).toBe(encrypted)
  })

  it('rejects plaintext or ciphertext encrypted with another key', () => {
    const service = new GitHubSsoSecretService(
      new ConfigService({
        SECRETS_ENCRYPTION_KEY: 'first-key'
      })
    )
    const otherService = new GitHubSsoSecretService(
      new ConfigService({
        SECRETS_ENCRYPTION_KEY: 'second-key'
      })
    )
    const encrypted = service.encrypt('github-client-secret')

    expect(() => service.decrypt('github-client-secret')).toThrow('not encrypted')
    expect(() => otherService.decrypt(encrypted)).toThrow()
  })

  it.each([
    ['a missing key', {}],
    ['the host default key', { secretsEncryptionKey: 'default_secrets_encryption_key' }],
    ['the explicit default key', { SECRETS_ENCRYPTION_KEY: 'default_secrets_encryption_key' }]
  ])('rejects %s instead of encrypting with a public fallback', (_, config) => {
    const service = new GitHubSsoSecretService(new ConfigService(config))

    expect(() => service.encrypt('github-client-secret')).toThrow(
      'SECRETS_ENCRYPTION_KEY must be configured to a non-default value'
    )
  })
})
