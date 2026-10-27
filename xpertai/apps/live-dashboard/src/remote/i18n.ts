import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
import zhHant from './locales/zh-Hant.json'
type Catalog = Record<keyof typeof en, string>
export const i18n = createRemoteI18n({ en, 'zh-Hans': zh satisfies Catalog, 'zh-Hant': zhHant satisfies Catalog }, 'en')
export function messages(locale: string): Catalog {
  i18n.setLocale(locale)
  document.documentElement.lang = i18n.getLocale()
  return Object.fromEntries(Object.keys(en).map(key => [key, i18n.t(key as keyof typeof en)])) as Catalog
}
