import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

export type Catalog = typeof en

export const i18n = createRemoteI18n(
  {
    en,
    'zh-Hans': zh satisfies Record<keyof Catalog, string>
  },
  'zh-Hans'
)

export function messages(locale: string): Catalog {
  i18n.setLocale(locale)
  document.documentElement.lang = i18n.getLocale()
  return Object.fromEntries(Object.keys(en).map((key) => [key, i18n.t(key as keyof Catalog)])) as Catalog
}
