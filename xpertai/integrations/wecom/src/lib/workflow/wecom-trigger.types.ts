export const WeComTrigger = 'wecom'

export type TWeComTriggerConfig = {
  enabled: boolean
  integrationId: string
  sessionTimeoutSeconds?: number
  summaryWindowSeconds?: number
}
