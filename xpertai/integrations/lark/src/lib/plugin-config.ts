import { z } from 'zod'

export const DEFAULT_STREAM_UPDATE_WINDOW_MS = 2000
export const MIN_STREAM_UPDATE_WINDOW_MS = 100
export const MAX_STREAM_UPDATE_WINDOW_MS = 10000
export const DEFAULT_GROUP_MENTION_DEBOUNCE_MS = 2000
export const DEFAULT_GROUP_MENTION_MAX_WINDOW_MS = 8000
export const DEFAULT_GROUP_MENTION_MAX_MESSAGES = 8
export const DEFAULT_GROUP_MENTION_MAX_PARTICIPANTS = 6

export const IntegrationLarkPluginConfigSchema = z.object({
	streaming: z
		.object({
			updateWindowMs: z
				.coerce.number()
				.int()
				.min(MIN_STREAM_UPDATE_WINDOW_MS)
				.max(MAX_STREAM_UPDATE_WINDOW_MS)
				.default(DEFAULT_STREAM_UPDATE_WINDOW_MS)
		})
		.default({}),
	groupMentionWindow: z
		.object({
			debounceMs: z.coerce.number().int().min(100).max(30000).default(DEFAULT_GROUP_MENTION_DEBOUNCE_MS),
			maxWindowMs: z
				.coerce.number()
				.int()
				.min(DEFAULT_GROUP_MENTION_DEBOUNCE_MS)
				.max(60000)
				.default(DEFAULT_GROUP_MENTION_MAX_WINDOW_MS),
			maxMessages: z.coerce.number().int().min(1).max(64).default(DEFAULT_GROUP_MENTION_MAX_MESSAGES),
			maxParticipants: z
				.coerce.number()
				.int()
				.min(1)
				.max(64)
				.default(DEFAULT_GROUP_MENTION_MAX_PARTICIPANTS)
		})
		.default({})
})

export type IntegrationLarkPluginConfig = z.infer<typeof IntegrationLarkPluginConfigSchema>
