import type {
  WechatChatFilterMode,
  WechatGroupTriggerOverride,
  WechatGroupTriggerMode,
  WechatSelfMessagePolicy
} from '../types.js'
import { WECHAT_TRIGGER_KEY } from '../constants.js'

export const WechatTrigger = WECHAT_TRIGGER_KEY

export type TWechatTriggerConfig = {
  enabled: boolean
  integrationId: string
  accountUuid?: string
  sessionTimeoutSeconds?: number
  summaryWindowSeconds?: number
  historyContextLimit?: number
  historyContextWindowSeconds?: number
  ignoreSelfMessages?: boolean
  selfMessagePolicy?: WechatSelfMessagePolicy
  chatFilterMode?: WechatChatFilterMode
  allowedContactIds?: string[] | string
  blockedContactIds?: string[] | string
  allowedGroupIds?: string[] | string
  blockedGroupIds?: string[] | string
  allowedSenderIds?: string[] | string
  blockedSenderIds?: string[] | string
  allowedKeywords?: string[] | string
  groupTriggerMode?: WechatGroupTriggerMode
  groupKeywords?: string[] | string
  mentionFallbackNames?: string[] | string
  groupTriggerOverrides?: WechatGroupTriggerOverride[]
  groupJoinWelcomeEnabled?: boolean
  groupJoinWelcomePrompt?: string
}
