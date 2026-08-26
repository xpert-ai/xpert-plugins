import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { QQ_MAIL_CONFIRMATION_TTL_MS, QQ_MAIL_MAX_CONFIRMATIONS } from '../constants.js'
import { QqMailConnectorError } from '../errors.js'

type ConfirmationEntry = {
  handle: string
  connectorId: string
  operation: string
  fingerprint: string
  providerToken: string
  expiresAt: number
}

@Injectable()
export class QqMailConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(input: {
    connectorId: string
    operation: string
    arguments: Record<string, unknown>
    providerToken: string
    providerExpiresAt?: string
  }) {
    this.evictExpired()
    const handle = randomUUID()
    const providerExpiry = input.providerExpiresAt ? Date.parse(input.providerExpiresAt) : Number.NaN
    const expiresAt = Number.isFinite(providerExpiry)
      ? Math.min(providerExpiry, Date.now() + QQ_MAIL_CONFIRMATION_TTL_MS)
      : Date.now() + QQ_MAIL_CONFIRMATION_TTL_MS
    this.entries.set(handle, {
      handle,
      connectorId: input.connectorId,
      operation: input.operation,
      fingerprint: confirmationFingerprint(input.arguments),
      providerToken: input.providerToken,
      expiresAt
    })
    this.enforceLimit()
    return { handle, expiresAt: new Date(expiresAt).toISOString() }
  }

  take(input: { handle: string; connectorId: string; operation: string; arguments: Record<string, unknown> }) {
    const entry = this.entries.get(input.handle)
    this.entries.delete(input.handle)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new QqMailConnectorError('CONFIRMATION_EXPIRED', 'QQ Mail confirmation expired; restart the operation')
    }
    if (
      entry.connectorId !== input.connectorId ||
      entry.operation !== input.operation ||
      entry.fingerprint !== confirmationFingerprint(input.arguments)
    ) {
      throw new QqMailConnectorError('CONFIRMATION_INVALID', 'QQ Mail confirmation does not match this operation')
    }
    return entry.providerToken
  }

  clear() {
    this.entries.clear()
  }

  private evictExpired() {
    const now = Date.now()
    for (const [handle, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(handle)
    }
  }

  private enforceLimit() {
    while (this.entries.size > QQ_MAIL_MAX_CONFIRMATIONS) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (!oldest) return
      this.entries.delete(oldest)
    }
  }
}

export function confirmationFingerprint(value: Record<string, unknown>) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
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
