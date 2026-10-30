import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
export const i18n = createRemoteI18n({ en, 'zh-Hans': zh }, 'en')
