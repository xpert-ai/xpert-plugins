import { WechatPersonalGroupTriggerMode } from '../types.js'
import { WECHAT_PERSONAL_TRIGGER_KEY } from '../constants.js'

export const WechatPersonalTrigger = WECHAT_PERSONAL_TRIGGER_KEY

export type TWechatPersonalTriggerConfig = {
  enabled: boolean
  integrationId: string
  sessionTimeoutSeconds?: number
  summaryWindowSeconds?: number
  groupTriggerMode?: WechatPersonalGroupTriggerMode
  groupKeywords?: string[] | string
}
