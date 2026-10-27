import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
export type MessageKey = keyof typeof en
/** Locale catalogs and interpolation use the same adapter as the other Remote Views. */
export function i18n(locale?: string) {
  const messages = createRemoteI18n({ en, 'zh-Hans': zh satisfies Record<MessageKey, string> })
  messages.setLocale(locale)
  return { locale: /^zh(?:[-_]|$)/i.test(locale ?? '') ? 'zh-CN' : 'en-US', t: messages.t }
}
