import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { en, type MessageKey } from './en'
import { zh } from './zh'
export type SupportedLocale = 'en-US' | 'zh-Hans'
const aliases: Record<string, SupportedLocale> = { 'en-US': 'en-US', en: 'en-US', en_US: 'en-US', 'zh-Hans': 'zh-Hans', zh_Hans: 'zh-Hans', 'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans' }
export function normalizeLocale(value: string): SupportedLocale { return aliases[value] ?? 'en-US' }
type Values = Record<string, string | number>
export function createI18n(locale: SupportedLocale) {
  const catalog = locale === 'zh-Hans' ? zh : en, plural = new Intl.PluralRules(locale)
  const number = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value)
  const t = (key: MessageKey, values: Values = {}) => {
    const message = catalog[key]
    const template = typeof message === 'string' ? message : plural.select(Number(values.count)) === 'one' ? message.one : message.other
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ''))
  }
  return { locale, t, number,
    distance: (meters: number) => meters < 1000 ? t('distance.meters', { value: number(Math.round(meters)) }) : t('distance.km', { value: number(meters / 1000, { maximumFractionDigits: 1 }) }),
    duration: (seconds: number) => { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes < 60 ? t('duration.minutes', { value: number(minutes) }) : t('duration.hours', { hours: number(Math.floor(minutes / 60)), minutes: number(minutes % 60) }) }
  }
}
const Context = createContext(createI18n('en-US'))
export function MapsI18nProvider({ locale, children }: { locale: SupportedLocale; children: ReactNode }) {
  const value = useMemo(() => createI18n(locale), [locale])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useMapsI18n = () => useContext(Context)
export type { MessageKey }
