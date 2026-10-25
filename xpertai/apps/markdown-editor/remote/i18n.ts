import { createRemoteI18n, useRemoteLocale, useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

// Catalog keys are checked across languages. Keep copy out of component markup.
export const i18n = createRemoteI18n({ en, 'zh-Hans': zh satisfies Record<keyof typeof en, string> })
export const t = i18n.t
export type MessageKey = keyof typeof en
export const useLocale = () => useRemoteLocale(i18n)
export const useMessage = (initial = '') => useLocalizedMessage(i18n, initial)
