export type WeComApiPayload = Record<string, unknown>

export type WeComRuntimeCredential = {
  connectorId: string
  accessToken: string
  corpId: string
  agentId: string
  profile: {
    userId?: string
    name?: string
  }
}

export type WeComMessageKind =
  | { type: 'text'; content: string }
  | { type: 'markdown'; content: string }
  | { type: 'file'; mediaId: string }

export type WeComSendMessageInput = {
  accessToken: string
  agentId: string
  userIds: string[]
  message: WeComMessageKind
}
