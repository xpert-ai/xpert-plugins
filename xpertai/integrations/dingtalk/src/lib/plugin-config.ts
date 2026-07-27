import { z } from 'zod'

export const DEFAULT_EVENT_DEDUP_TTL_SECONDS = 300

export const IntegrationDingTalkPluginConfigSchema = z.object({
  dedupe: z
    .object({
      ttlSeconds: z.coerce.number().int().min(10).max(3600).default(DEFAULT_EVENT_DEDUP_TTL_SECONDS)
    })
    .default({})
})

export type IntegrationDingTalkPluginConfig = z.infer<typeof IntegrationDingTalkPluginConfigSchema>
