import { z } from 'zod'

export const DEFAULT_STREAM_UPDATE_WINDOW_MS = 2000
export const MIN_STREAM_UPDATE_WINDOW_MS = 100
export const MAX_STREAM_UPDATE_WINDOW_MS = 10000
export const DEFAULT_FIRST_FLUSH_MIN_CHARS = 24
export const MIN_FIRST_FLUSH_MIN_CHARS = 1
export const MAX_FIRST_FLUSH_MIN_CHARS = 500
export const DEFAULT_EVENT_DEDUP_TTL_SECONDS = 300

export const IntegrationDingTalkPluginConfigSchema = z.object({
  streaming: z
    .object({
      updateWindowMs: z
        .coerce.number()
        .int()
        .min(MIN_STREAM_UPDATE_WINDOW_MS)
        .max(MAX_STREAM_UPDATE_WINDOW_MS)
        .default(DEFAULT_STREAM_UPDATE_WINDOW_MS),
      firstFlushMinChars: z
        .coerce.number()
        .int()
        .min(MIN_FIRST_FLUSH_MIN_CHARS)
        .max(MAX_FIRST_FLUSH_MIN_CHARS)
        .default(DEFAULT_FIRST_FLUSH_MIN_CHARS)
    })
    .default({}),
  dedupe: z
    .object({
      ttlSeconds: z.coerce.number().int().min(10).max(3600).default(DEFAULT_EVENT_DEDUP_TTL_SECONDS)
    })
    .default({})
})

export type IntegrationDingTalkPluginConfig = z.infer<typeof IntegrationDingTalkPluginConfigSchema>
