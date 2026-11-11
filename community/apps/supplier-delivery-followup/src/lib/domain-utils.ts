import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IsNull } from 'typeorm'
import { DELIVERY_TIME_ZONE } from './constants'
import { DeliveryDomainError } from './domain-error'
import type { DeliveryScope, PageInput } from './types'

/** Copy the server sends into the chat lives in `locales/<locale>.json`, next to this file in src and in dist. */
const MESSAGE_LOCALES = ['en', 'zh-Hans'] as const
type MessageCatalog = { 'chat.parseCommand': string }
const readCatalog = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, 'locales', `${locale}.json`), 'utf8')) as MessageCatalog
const messages: Record<(typeof MESSAGE_LOCALES)[number], MessageCatalog> = {
  en: readCatalog('en'),
  'zh-Hans': readCatalog('zh-Hans')
}

export function scopeValues(scope: DeliveryScope) {
  if (!scope?.tenantId?.trim() || !scope.userId?.trim() || scope.organizationId === '') {
    throw new DeliveryDomainError('invalid_scope')
  }
  return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? null }
}
export function scopeWhere(scope: DeliveryScope) {
  const values = scopeValues(scope)
  return { tenantId: values.tenantId, organizationId: values.organizationId ?? IsNull() }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
// Nullable SQL unique keys permit duplicate NULLs. Deterministic primary keys also
// enforce idempotency for tenant-wide (organizationId = NULL) writes.
export function scopedId(scope: DeliveryScope, kind: string, ...keys: unknown[]) {
  const { tenantId, organizationId } = scopeValues(scope)
  return hash(JSON.stringify([tenantId, organizationId, kind, ...keys]))
}
export function validateDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new DeliveryDomainError('invalid_date', { value })
  }
  return value
}
export function validateQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new DeliveryDomainError('invalid_quantity', { value })
  return value
}
export function pagination(input: PageInput = {}) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 20
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  )
    throw new DeliveryDomainError('invalid_page')
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}
export const delayDays = (line: { promisedDate: string; originalDate: string }) =>
  Math.round((Date.parse(line.promisedDate) - Date.parse(line.originalDate)) / 86_400_000)

/** Calendar day shared by reply deduplication and the Agent's relative-date anchor. */
/**
 * The message the workbench sends to the assistant. The first line is for people (it becomes the chat title); the
 * second carries the ids the tools need. It deliberately quotes no supplier text, which stays tool-read data.
 */
export function parseCommandText(reply: { id: string; parseAttempt: number; createdAt: string }, locale: unknown) {
  const language = MESSAGE_LOCALES.find((value) => value === locale) ?? 'en'
  const receivedAt = new Intl.DateTimeFormat(language, {
    timeZone: DELIVERY_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(reply.createdAt))
  const label = messages[language]['chat.parseCommand']
    .replace('{{receivedAt}}', receivedAt)
    .replace('{{attempt}}', String(reply.parseAttempt))
  return `${label}\nreply:${reply.id} attempt:${reply.parseAttempt}`
}

export function receivedDateAt(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * A run stopped in the chat aborts the run's signal, which the host hands to every model call. Read that signal
 * (or the standard AbortError name) rather than the error text, so a provider error that merely mentions an
 * abort (for example a dropped upstream stream) still counts as a model failure.
 */
export function isRunStopped(error: unknown, signal: AbortSignal | undefined) {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError')
}

/** Only a message summary is persisted, never error/request/response objects or stacks. */
export function modelFailureSummary(message: string) {
  return (
    message
      .replace(
        /(?:authorization|headers?|api[-_ ]?key|access[-_ ]?token|token|secret|password)\s*["']?\s*[:=][^\r\n]*/gi,
        '[redacted]'
      )
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[redacted]')
      .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[redacted]')
      .replace(/https?:\/\/\S+/gi, '[redacted URL]')
      .replace(/[\r\n\u2028\u2029]+/g, ' ')
      .trim()
      .slice(0, 300) || 'Model call failed.'
  )
}
