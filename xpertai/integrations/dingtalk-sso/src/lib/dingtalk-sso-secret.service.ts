import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const PREFIX = 'enc:v1:'
const DEFAULT_KEY = 'default_secrets_encryption_key'
const IV_LENGTH = 12
const TAG_LENGTH = 16

@Injectable()
export class DingTalkSsoSecretService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string): string {
    const secret = requireSecret(value)
    if (secret.startsWith(PREFIX)) {
      this.decrypt(secret)
      return secret
    }
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    return `${PREFIX}${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64')}`
  }

  decrypt(value: string): string {
    const encrypted = requireSecret(value)
    if (!encrypted.startsWith(PREFIX)) {
      throw new Error('DingTalk OAuth client secret is not encrypted.')
    }
    const payload = Buffer.from(encrypted.slice(PREFIX.length), 'base64')
    if (payload.length <= IV_LENGTH + TAG_LENGTH) {
      throw new Error('DingTalk OAuth client secret ciphertext is invalid.')
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(), payload.subarray(0, IV_LENGTH))
    decipher.setAuthTag(payload.subarray(payload.length - TAG_LENGTH))
    return Buffer.concat([
      decipher.update(payload.subarray(IV_LENGTH, payload.length - TAG_LENGTH)),
      decipher.final()
    ]).toString('utf8')
  }

  private key(): Buffer {
    const configured =
      this.configService.get<string>('SECRETS_ENCRYPTION_KEY')?.trim() ??
      this.configService.get<string>('secretsEncryptionKey')?.trim()
    if (!configured || configured === DEFAULT_KEY) {
      throw new Error('SECRETS_ENCRYPTION_KEY must be configured to a non-default value for DingTalk SSO.')
    }
    return createHash('sha256').update(configured).digest()
  }
}

function requireSecret(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('DingTalk OAuth client secret is required.')
  }
  return value.trim()
}
