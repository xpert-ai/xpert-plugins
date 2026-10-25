export const SUPPORTED_LOCALES = ['en-US', 'zh-Hans', 'zh-Hant'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function resolveLocale(value?: string): SupportedLocale {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('hant') || normalized.includes('tw') || normalized.includes('hk')) return 'zh-Hant'
  if (normalized.startsWith('zh')) return 'zh-Hans'
  return 'en-US'
}
