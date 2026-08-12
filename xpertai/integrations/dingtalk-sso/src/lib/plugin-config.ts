import { z } from 'zod'

// OAuth credentials belong to the tenant-level system integration.
export const DingTalkSsoPluginConfigSchema = z.object({})
export type DingTalkSsoPluginConfig = z.infer<typeof DingTalkSsoPluginConfigSchema>
