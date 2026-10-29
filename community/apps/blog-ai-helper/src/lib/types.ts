export type BlogArticleRecordStatus = 'draft' | 'analyzing' | 'reviewing' | 'saved' | 'failed'

export type BlogAiHelperScope = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string
  conversationId?: string | null
  assistantId?: string | null
}

export type BlogAiHelperWorkbenchQuery = {
  recordId?: string
  search?: string
  page?: number
  pageSize?: number
}

export type CreateArticleRecordInput = {
  content: string
  title?: string
  xpertId?: string
  agentKey?: string
}

export type SaveArticleAnalysisInput = {
  recordId: string
  summary: string
  tags?: string[]
  titleSuggestions?: string[]
  errorMessage?: string
}

export type BlogAiHelperChatCommand = {
  commandKey: 'assistant.chat.send_message'
  payload: {
    text: string
    clientMessageId: string
    followUpMode: 'queue'
    state: {
      blogAiHelper: {
        action: 'process_article' | 'regenerate_article'
        recordId: string
      }
    }
  }
  recordId: string
}
