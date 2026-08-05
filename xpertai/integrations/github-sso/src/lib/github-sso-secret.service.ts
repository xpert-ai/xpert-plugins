import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const ENCRYPTED_SECRET_PREFIX = 'enc:v1:'
const INSECURE_DEFAULT_SECRETS_ENCRYPTION_KEY = 'default_secrets_encryption_key'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

@Injectable()
export class GitHubSsoSecretService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(secret: string): string {
    const normalized = requireSecret(secret)
    if (normalized.startsWith(ENCRYPTED_SECRET_PREFIX)) {
      this.decrypt(normalized)
      return normalized
    }

    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', this.deriveKey(), iv)
    const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])
    const payload = Buffer.concat([iv, encrypted, cipher.getAuthTag()])
    return `${ENCRYPTED_SECRET_PREFIX}${payload.toString('base64')}`
  }

  decrypt(encryptedSecret: string): string {
    const normalized = requireSecret(encryptedSecret)
    if (!normalized.startsWith(ENCRYPTED_SECRET_PREFIX)) {
      throw new Error('GitHub OAuth client secret is not encrypted.')
    }

    const payload = Buffer.from(normalized.slice(ENCRYPTED_SECRET_PREFIX.length), 'base64')
    if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('GitHub OAuth client secret ciphertext is invalid.')
    }

    const iv = payload.subarray(0, IV_LENGTH)
    const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH)
    const encrypted = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH)
    const decipher = createDecipheriv('aes-256-gcm', this.deriveKey(), iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }

  private deriveKey(): Buffer {
    const configuredKey =
      this.configService.get<string>('SECRETS_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('secretsEncryptionKey')?.trim()
    if (!configuredKey || configuredKey === INSECURE_DEFAULT_SECRETS_ENCRYPTION_KEY) {
      throw new Error('SECRETS_ENCRYPTION_KEY must be configured to a non-default value for GitHub SSO.')
    }
    return createHash('sha256').update(configuredKey).digest()
  }
}

function requireSecret(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('GitHub OAuth client secret is required.')
  }
  return value.trim()
}
