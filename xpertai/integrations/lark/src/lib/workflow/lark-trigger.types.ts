export const LarkTrigger = 'lark'

export const LARK_SINGLE_CHAT_SCOPE_VALUES = ['self', 'selected_users', 'all_users'] as const
export const LARK_ALLOWED_GROUP_SCOPE_VALUES = ['all_chats', 'selected_chats'] as const
export const LARK_GROUP_USER_SCOPE_VALUES = ['self', 'selected_users', 'all_users'] as const
export const LARK_GROUP_REPLY_STRATEGY_VALUES = ['mention_only', 'all_messages'] as const

export type TLarkSingleChatScope = (typeof LARK_SINGLE_CHAT_SCOPE_VALUES)[number]
export type TLarkAllowedGroupScope = (typeof LARK_ALLOWED_GROUP_SCOPE_VALUES)[number]
export type TLarkGroupUserScope = (typeof LARK_GROUP_USER_SCOPE_VALUES)[number]
export type TLarkGroupReplyStrategy = (typeof LARK_GROUP_REPLY_STRATEGY_VALUES)[number]

export type TLarkTriggerConfig = {
	enabled: boolean
	integrationId: string
	singleChatScope: TLarkSingleChatScope
	singleChatUserOpenIds: string[]
	executeAsMappedUser: boolean
	streamingEnabled: boolean
	allowedGroupScope: TLarkAllowedGroupScope
	allowedGroupChatIds: string[]
	groupUserScope: TLarkGroupUserScope
	groupUserOpenIds: string[]
	groupReplyStrategy: TLarkGroupReplyStrategy
}

export const DEFAULT_LARK_TRIGGER_CONFIG: Omit<TLarkTriggerConfig, 'integrationId'> = {
	enabled: true,
	singleChatScope: 'all_users',
	singleChatUserOpenIds: [],
	executeAsMappedUser: false,
	streamingEnabled: true,
	allowedGroupScope: 'all_chats',
	allowedGroupChatIds: [],
	groupUserScope: 'all_users',
	groupUserOpenIds: [],
	groupReplyStrategy: 'mention_only'
}
