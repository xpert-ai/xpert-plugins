import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ZSXQ_CONFIRMATION_TTL_MS, ZSXQ_MAX_CONFIRMATIONS } from '../constants.js'
import { ZsxqConnectorError } from '../errors.js'

type ConfirmationIdentity = {
  tenantId: string
  organizationId?: string | null
  userId: string
  workspaceId: string
  connectorId: string
}

type ConfirmationEntry = ConfirmationIdentity & {
  operation: string
  fingerprint: string
  expiresAt: number
}

@Injectable()
export class ZsxqConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(input: ConfirmationIdentity & { operation: string; arguments: object }) {
    this.evictExpired()
    const handle = randomUUID()
    const expiresAt = Date.now() + ZSXQ_CONFIRMATION_TTL_MS
    this.entries.set(handle, {
      ...identity(input),
      operation: input.operation,
      fingerprint: confirmationFingerprint(input.arguments),
      expiresAt
    })
    this.enforceLimit()
    return { handle, expiresAt: new Date(expiresAt).toISOString() }
  }

  take(input: ConfirmationIdentity & { handle: string; operation: string; arguments: object }): void {
    const entry = this.entries.get(input.handle)
    this.entries.delete(input.handle)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new ZsxqConnectorError(
        'CONFIRMATION_EXPIRED',
        'Knowledge Planet confirmation expired. Restart the operation.'
      )
    }
    const expected = identity(input)
    if (
      entry.tenantId !== expected.tenantId ||
      entry.organizationId !== expected.organizationId ||
      entry.userId !== expected.userId ||
      entry.workspaceId !== expected.workspaceId ||
      entry.connectorId !== expected.connectorId ||
      entry.operation !== input.operation ||
      entry.fingerprint !== confirmationFingerprint(input.arguments)
    ) {
      throw new ZsxqConnectorError(
        'CONFIRMATION_INVALID',
        'Knowledge Planet confirmation does not match this operation.'
      )
    }
  }

  clear(): void {
    this.entries.clear()
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [handle, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(handle)
  }

  private enforceLimit(): void {
    while (this.entries.size > ZSXQ_MAX_CONFIRMATIONS) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (!oldest) return
      this.entries.delete(oldest)
    }
  }
}

export function confirmationFingerprint(value: object): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function identity(input: ConfirmationIdentity): ConfirmationIdentity {
  return {
    tenantId: input.tenantId,
    organizationId: input.organizationId ?? null,
    userId: input.userId,
    workspaceId: input.workspaceId,
    connectorId: input.connectorId
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}
