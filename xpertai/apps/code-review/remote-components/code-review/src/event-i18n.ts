import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/events.en.json'
import zh from './locales/events.zh-Hans.json'
import setupEn from '../../../remote/locales/en.json'
import setupZh from '../../../remote/locales/zh-Hans.json'
export const eventI18n = createRemoteI18n({ en: { ...en, ...setupEn }, 'zh-Hans': { ...zh, ...setupZh } })
function isMessageKey(key: string): key is keyof typeof en { return Object.hasOwn(en, key) }
export function eventMessage(key: string) { return isMessageKey(key) ? eventI18n.t(key) : undefined }
