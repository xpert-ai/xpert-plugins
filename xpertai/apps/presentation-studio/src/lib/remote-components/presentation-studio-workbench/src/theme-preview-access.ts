import type { JsonObject, JsonValue, ThemePreviewDescriptor, ThemePreviewItem } from './types'

const THEME_PREVIEW_ACCESS_CONCURRENCY = 4
const THEME_PREVIEW_ACCESS_REFRESH_WINDOW_MS = 45_000
const THEME_PREVIEW_ACCESS_REFRESH_RETRY_MS = 30_000

export type ThemePreviewAccessRequester = (
  fileKey: string,
  purpose: 'preview'
) => Promise<JsonValue>

export async function hydrateThemePreviewAccess(
  items: ThemePreviewDescriptor[],
  requestAccess: ThemePreviewAccessRequester
): Promise<ThemePreviewItem[]> {
  const hydrated: Array<ThemePreviewItem | undefined> = new Array(items.length)
  await mapWithConcurrency(items, THEME_PREVIEW_ACCESS_CONCURRENCY, async (item, index) => {
    const directUrl = normalizedUrl(item.fileUrl)
    if (directUrl) {
      hydrated[index] = { ...item, fileUrl: directUrl }
      return
    }
    const grant = readThemePreviewAccessGrant(await requestAccess(item.fileKey, 'preview'))
    if (!grant) throw new Error(`Theme preview access is unavailable: ${item.themePack}`)
    hydrated[index] = { ...item, fileUrl: grant.url, accessExpiresAt: grant.expiresAt }
  })
  return hydrated.filter((item): item is ThemePreviewItem => item !== undefined)
}

export function themePreviewAccessNeedsRefresh(items: ThemePreviewItem[], now = Date.now()) {
  if (!items.length) return true
  return items.some((item) => {
    if (!item.accessExpiresAt) return false
    const expiresAt = Date.parse(item.accessExpiresAt)
    return !Number.isFinite(expiresAt) || expiresAt <= now + THEME_PREVIEW_ACCESS_REFRESH_WINDOW_MS
  })
}

export function themePreviewAccessRefreshDelay(items: ThemePreviewItem[], now = Date.now()) {
  const expiries = items.flatMap((item) => {
    const expiresAt = Date.parse(item.accessExpiresAt ?? '')
    return Number.isFinite(expiresAt) ? [expiresAt] : []
  })
  if (!expiries.length) return null
  return Math.max(
    THEME_PREVIEW_ACCESS_REFRESH_RETRY_MS,
    Math.min(...expiries) - now - THEME_PREVIEW_ACCESS_REFRESH_WINDOW_MS
  )
}

export function readThemePreviewAccessUrl(value: JsonValue): string | null {
  if (!isJsonObject(value)) return null
  const directUrl = normalizedUrl(value.url)
  if (directUrl) return directUrl
  for (const key of ['payload', 'data', 'result']) {
    const nestedUrl = readThemePreviewAccessUrl(value[key])
    if (nestedUrl) return nestedUrl
  }
  return null
}

function readThemePreviewAccessGrant(value: JsonValue): { url: string; expiresAt: string } | null {
  if (!isJsonObject(value)) return null
  const url = normalizedUrl(value.url)
  const expiresAt = normalizedExpiry(value.expiresAt)
  if (url && expiresAt) return { url, expiresAt }
  for (const key of ['payload', 'data', 'result']) {
    const nestedGrant = readThemePreviewAccessGrant(value[key])
    if (nestedGrant) return nestedGrant
  }
  return null
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<void>
) {
  let index = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (index < items.length) {
        const currentIndex = index
        index += 1
        const item = items[currentIndex]
        if (item !== undefined) await operation(item, currentIndex)
      }
    }
  )
  await Promise.all(workers)
}

function normalizedUrl(value: JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizedExpiry(value: JsonValue | undefined) {
  if (typeof value !== 'string') return null
  const expiresAt = value.trim()
  return expiresAt && Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
