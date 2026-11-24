import { createRemoteI18n } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
export const i18n=createRemoteI18n({en,'zh-Hans':zh},'en')
export const statusKey={draft:'status.draft',running:'status.running',ready:'status.ready',abstained:'status.abstained',confirmed:'status.confirmed',failed:'status.failed'} as const
export const roleKey={fundamental:'stage.fundamental',technical:'stage.technical',risk:'stage.risk',decision:'stage.decision'} as const
export const kindKey={synthetic:'kind.synthetic',historical:'kind.historical',live:'kind.live'} as const
