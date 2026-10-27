import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
type DictionaryKey = keyof typeof en
export function translator(locale?: string) {
  const i18n = createRemoteI18n({ en, 'zh-Hans': zh satisfies Record<DictionaryKey, string> }, locale)
  return Object.assign((key: DictionaryKey) => i18n.t(key), { i18n })
}
