import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { WECOM_CONFIRMATION_TTL_MS, WECOM_MAX_CONFIRMATIONS } from '../constants.js'
import { WeComConnectorError } from '../errors.js'

type ConfirmationEntry = {
  connectorId: string
  operation: string
  fingerprint: string
  expiresAt: number
}

@Injectable()
export class WeComConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(input: { connectorId: string; operation: string; arguments: Record<string, unknown> }) {
    this.evictExpired()
    const handle = randomUUID()
    const expiresAt = Date.now() + WECOM_CONFIRMATION_TTL_MS
    this.entries.set(handle, {
      connectorId: input.connectorId,
      operation: input.operation,
      fingerprint: confirmationFingerprint(input.arguments),
      expiresAt
    })
    this.enforceLimit()
    return { handle, expiresAt: new Date(expiresAt).toISOString() }
  }

  take(input: { handle: string; connectorId: string; operation: string; arguments: Record<string, unknown> }) {
    const entry = this.entries.get(input.handle)
    this.entries.delete(input.handle)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new WeComConnectorError('CONFIRMATION_EXPIRED', 'WeCom confirmation expired; restart the operation.')
    }
    if (
      entry.connectorId !== input.connectorId ||
      entry.operation !== input.operation ||
      entry.fingerprint !== confirmationFingerprint(input.arguments)
    ) {
      throw new WeComConnectorError('CONFIRMATION_INVALID', 'WeCom confirmation does not match this operation.')
    }
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
    while (this.entries.size > WECOM_MAX_CONFIRMATIONS) {
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
