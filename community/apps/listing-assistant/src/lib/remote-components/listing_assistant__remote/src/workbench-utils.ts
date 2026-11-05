import type { Catalog } from './i18n'
import type { Status, TaskDetail, WorkbenchData } from './types'

export type Busy = null | 'load' | 'parse' | 'save' | 'create'

export type FormState = {
  title: string
  description: string
  price: string
  currency: string
  category: string
  attributes: Array<{ key: string; value: string }>
  specs: Array<{ name: string; price: string; stock: string }>
}

export const STATUS_LABEL: Record<Status, keyof Catalog> = {
  draft: 'statusDraft',
  parsing: 'statusParsing',
  review: 'statusReview',
  saved: 'statusSaved',
  failed: 'statusFailed'
}

export function emptyForm(): FormState {
  return { title: '', description: '', price: '', currency: 'CNY', category: '', attributes: [], specs: [] }
}

export function formFromDetail(detail: TaskDetail | null): FormState {
  const draft = detail?.draft
  if (!draft) return emptyForm()
  return {
    title: draft.title ?? '',
    description: draft.description ?? '',
    price: draft.price ?? '',
    currency: draft.currency ?? 'CNY',
    category: draft.category ?? '',
    attributes: Object.entries(draft.attributes ?? {}).map(([key, value]) => ({
      key,
      value: value === null || value === undefined ? '' : String(value)
    })),
    specs: draft.specs.map((spec) => ({
      name: spec.name,
      price: spec.price ?? '',
      stock: spec.stock === null || spec.stock === undefined ? '' : String(spec.stock)
    }))
  }
}

export function normalizeLocale(locale?: string) {
  return locale && locale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}

export function normalizeData(raw: unknown): WorkbenchData {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tasks = value.items ?? value.tasks
  const selectedTask = value.item ?? value.selectedTask
  return {
    tasks: Array.isArray(tasks) ? (tasks as WorkbenchData['tasks']) : [],
    selectedTask: (selectedTask as TaskDetail | null) ?? null
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

const ERROR_KEYS: Record<string, keyof Catalog> = {
  AI_NOT_CONFIGURED: 'errAiNotConfigured',
  AI_TIMEOUT: 'errAiTimeout',
  AI_INVALID_JSON: 'errAiInvalidJson',
  AI_INVALID_OUTPUT: 'errAiInvalidOutput',
  AI_CALL_FAILED: 'errAiCallFailed',
  AI_SIMULATED_FAILURE: 'errAiSimulated',
  AI_RUN_INTERRUPTED: 'errAiInterrupted',
  BUSY_PARSING: 'errBusyParsing',
  TASK_NOT_FOUND: 'errTaskNotFound',
  SOURCE_REQUIRED: 'errSourceRequired',
  SOURCE_TOO_LONG: 'errSourceTooLong',
  DRAFT_REQUIRED: 'errDraftRequired',
  BATCH_TOO_LARGE: 'errBatchTooLarge'
}

/** Maps a language-neutral backend error code to localized copy. */
export function errorText(t: Catalog, code?: string | null, fallback?: string | null) {
  const key = code ? ERROR_KEYS[code] : undefined
  if (key) return t[key]
  return fallback || t.errUnknown
}
