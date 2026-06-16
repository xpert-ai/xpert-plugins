import { WechatPersonalChatFilterMode, WechatPersonalGroupTriggerMode } from '../types.js'
import { WECHAT_PERSONAL_TRIGGER_KEY } from '../constants.js'

export const WechatPersonalTrigger = WECHAT_PERSONAL_TRIGGER_KEY

export type TWechatPersonalTriggerConfig = {
  enabled: boolean
  integrationId: string
  sessionTimeoutSeconds?: number
  summaryWindowSeconds?: number
  historyContextLimit?: number
  ignoreSelfMessages?: boolean
  chatFilterMode?: WechatPersonalChatFilterMode
  allowedContactIds?: string[] | string
  blockedContactIds?: string[] | string
  allowedGroupIds?: string[] | string
  blockedGroupIds?: string[] | string
  allowedSenderIds?: string[] | string
  blockedSenderIds?: string[] | string
  groupTriggerMode?: WechatPersonalGroupTriggerMode
  groupKeywords?: string[] | string
}
