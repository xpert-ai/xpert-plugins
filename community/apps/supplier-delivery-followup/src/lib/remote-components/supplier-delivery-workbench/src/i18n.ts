import { createRemoteI18n, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../locales/en.json'
import zhHans from '../locales/zh-Hans.json'

/** One i18n instance per iframe; the bridge sets the locale from the validated host `init`. */
export const i18n = createRemoteI18n({ en, 'zh-Hans': zhHans })

export type MessageKey = Extract<keyof typeof en, string>

export const t = i18n.t

/** Re-render on locale changes without reloading data or resetting drafts. */
export function useLocale() {
  return useRemoteLocale(i18n)
}

export function formatDate(value: string | null | undefined) {
  if (!value) return ''
  // Business dates are calendar dates (YYYY-MM-DD); format them in UTC so they never shift by a day.
  return i18n.date(`${value}T00:00:00Z`, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  return i18n.date(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** A running duration such as "45 秒" or "1 分 05 秒". */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes
    ? t('time.minutesSeconds', { minutes, seconds: String(seconds).padStart(2, '0') })
    : t('time.seconds', { seconds })
}

export function formatPercent(value: number) {
  return i18n.number(value, { style: 'percent', maximumFractionDigits: 0 })
}
