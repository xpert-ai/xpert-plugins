import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale, useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import enCatalog from '../remote/locales/en-US.json'
import zhHansCatalog from '../remote/locales/zh-Hans.json'

export type SupportedLocale = 'en' | 'zh-Hans' | 'zh-Hant'
export type ResumeCatalog = typeof enCatalog

export const i18n = createRemoteI18n(
  {
    en: enCatalog,
    'zh-Hans': zhHansCatalog as Record<keyof ResumeCatalog, string>
  },
  typeof navigator === 'undefined' ? 'en' : navigator.language
)

export { RemoteI18nProvider, useRemoteLocale, useLocalizedMessage }
export type { ViewMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
