import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

export const i18n = createRemoteI18n({ en, 'zh-Hans': zh satisfies Record<keyof typeof en, string> })
export const { t } = i18n
export type MessageKey = keyof typeof en
type ErrorKey = Extract<MessageKey, `error.${string}`>

export function errorKey(code: string): ErrorKey {
  const key = `error.${code}`
  return Object.hasOwn(en, key) ? key as ErrorKey : 'error.unknown'
}
