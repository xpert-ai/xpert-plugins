export interface OntoAgentScope {
  tenantId?: string
  organizationId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
}

export type OntoAgentAnswerStatus = 'proposed' | 'confirmed' | 'rejected'

export type OntoAgentSyncRunStatus = 'applied' | 'unchanged' | 'offline' | 'sync_unstable' | 'failed'

export interface OntoAgentMiddlewareOptions {
  maxTerms?: number
  maxAssertions?: number
  maxChars?: number
  /** 是否注入只读使用契约稳定段（GOVERNED_CONTEXT_CONTRACT_HEADER），默认 true */
  injectHeader?: boolean
}
