import { createCipheriv, randomBytes } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import type { SitesScope } from './types.js'
export const SITES_CONFIG = 'SITES_CONFIG'
export function encryptEnvironment(value: string, key: string | undefined, scope: SitesScope, projectId: string, name: string) {
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new BadRequestException('Configure a 32-byte Sites environmentEncryptionKey before saving secrets')
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  cipher.setAAD(Buffer.from(JSON.stringify([scope.tenantId, scope.organizationId, scope.assistantId, scope.userId, projectId, name])))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}
