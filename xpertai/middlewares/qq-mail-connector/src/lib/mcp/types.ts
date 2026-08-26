export type QqMailAlias = {
  aliasId: string
  email: string
  name?: string
  isPrimary: boolean
}

export type QqMailAccount = {
  scopes: string[]
  aliases: QqMailAlias[]
  rateLimits: {
    requestsPerMinute?: number
    requestsPerHour?: number
    dailySendQuota?: number
  }
  constraints: {
    maxAttachmentSizeBytes?: number
    maxTotalAttachmentsSizeBytes?: number
    maxAttachmentCount?: number
  }
}

export type QqMailRuntimeCredential = {
  connectorId: string
  accessToken: string
  tokenType: string
  resource: string
}

export type QqMailMcpPayload = Record<string, unknown>

export type QqMailMcpToolFailure = {
  code?: number
  message: string
  details?: Record<string, unknown>
}

export type QqMailMcpCallResult = {
  payload: QqMailMcpPayload
  isError: boolean
}
