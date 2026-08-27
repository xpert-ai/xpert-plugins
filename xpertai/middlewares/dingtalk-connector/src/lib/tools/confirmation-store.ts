import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

const CONFIRMATION_TTL_MS = 5 * 60 * 1_000
const MAX_CONFIRMATIONS = 500

type ConfirmationEntry = {
  connectorId: string
  fingerprint: string
  expiresAt: number
}

@Injectable()
export class DingTalkConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(connectorId: string, input: Record<string, unknown>) {
    this.evictExpired()
    const handle = randomUUID()
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS
    this.entries.set(handle, {
      connectorId,
      fingerprint: confirmationFingerprint(input),
      expiresAt
    })
    this.enforceLimit()
    return { handle, expiresAt: new Date(expiresAt).toISOString() }
  }

  take(handle: string, connectorId: string, input: Record<string, unknown>) {
    const entry = this.entries.get(handle)
    this.entries.delete(handle)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new Error('DingTalk message confirmation expired; prepare the message again')
    }
    if (entry.connectorId !== connectorId || entry.fingerprint !== confirmationFingerprint(input)) {
      throw new Error('DingTalk message confirmation does not match this operation')
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
    while (this.entries.size > MAX_CONFIRMATIONS) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (!oldest) return
      this.entries.delete(oldest)
    }
  }
}

function confirmationFingerprint(value: Record<string, unknown>) {
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
