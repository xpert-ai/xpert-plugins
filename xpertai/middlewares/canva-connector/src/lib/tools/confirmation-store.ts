import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { CanvaConnectorError } from '../errors.js'

type ConfirmationEntry = {
  handle: string
  userId: string
  connectorId: string
  operation: string
  fingerprint: string
  expiresAt: number
}

@Injectable()
export class CanvaConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()
  private readonly ttlMs = 5 * 60 * 1000

  request(input: { userId: string; connectorId: string; operation: string; payload: Record<string, unknown> }) {
    this.evict()
    const handle = randomBytes(24).toString('base64url')
    const entry: ConfirmationEntry = {
      handle,
      userId: input.userId,
      connectorId: input.connectorId,
      operation: input.operation,
      fingerprint: fingerprint(input.payload),
      expiresAt: Date.now() + this.ttlMs
    }
    this.entries.set(handle, entry)
    return {
      confirmationRequired: true as const,
      confirmationHandle: handle,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      operation: input.operation
    }
  }

  consume(input: {
    handle?: string
    userId: string
    connectorId: string
    operation: string
    payload: Record<string, unknown>
  }) {
    this.evict()
    if (!input.handle)
      throw new CanvaConnectorError(
        'CANVA_CONFIRMATION_REQUIRED',
        'User confirmation is required for this Canva operation'
      )
    const entry = this.entries.get(input.handle)
    if (
      !entry ||
      entry.userId !== input.userId ||
      entry.connectorId !== input.connectorId ||
      entry.operation !== input.operation ||
      entry.fingerprint !== fingerprint(input.payload)
    )
      throw new CanvaConnectorError(
        'CANVA_CONFIRMATION_INVALID',
        'Canva confirmation handle is invalid or does not match the requested operation'
      )
    this.entries.delete(input.handle)
  }

  clear() {
    this.entries.clear()
  }
  private evict() {
    const now = Date.now()
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key)
  }
}

function fingerprint(value: Record<string, unknown>) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
