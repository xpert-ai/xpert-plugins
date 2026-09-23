import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { NETEASE_MAIL_CONFIRMATION_TTL_MS, NETEASE_MAIL_MAX_CONFIRMATIONS } from './constants.js'
import { NeteaseMailError } from './errors.js'

type ConfirmationEntry = {
  connectorId: string
  operation: 'send' | 'reply'
  fingerprint: string
  expiresAt: number
}

@Injectable()
export class NeteaseMailConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(input: { connectorId: string; operation: 'send' | 'reply'; arguments: Record<string, unknown> }) {
    this.evictExpired()
    const handle = randomUUID()
    const expiresAt = Date.now() + NETEASE_MAIL_CONFIRMATION_TTL_MS
    this.entries.set(handle, {
      connectorId: input.connectorId,
      operation: input.operation,
      fingerprint: confirmationFingerprint(input.arguments),
      expiresAt
    })
    this.enforceLimit()
    return { handle, expiresAt: new Date(expiresAt).toISOString() }
  }

  take(input: {
    handle: string
    connectorId: string
    operation: 'send' | 'reply'
    arguments: Record<string, unknown>
  }): void {
    const entry = this.entries.get(input.handle)
    this.entries.delete(input.handle)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new NeteaseMailError('MAIL_CONFIRMATION_EXPIRED', 'Email confirmation expired; restart the operation.')
    }
    if (
      entry.connectorId !== input.connectorId ||
      entry.operation !== input.operation ||
      entry.fingerprint !== confirmationFingerprint(input.arguments)
    ) {
      throw new NeteaseMailError('MAIL_CONFIRMATION_INVALID', 'Email confirmation does not match this operation.')
    }
  }

  clear(): void {
    this.entries.clear()
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [handle, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(handle)
      }
    }
  }

  private enforceLimit(): void {
    while (this.entries.size > NETEASE_MAIL_MAX_CONFIRMATIONS) {
      const oldest = this.entries.keys().next().value
      if (typeof oldest !== 'string') {
        return
      }
      this.entries.delete(oldest)
    }
  }
}

export function confirmationFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (!isRecord(value)) {
    return JSON.stringify(value) ?? 'undefined'
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
