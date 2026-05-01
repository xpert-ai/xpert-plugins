export function isChineseLanguage(language?: string | null): boolean {
  if (typeof language !== 'string') {
    return true
  }
  const normalized = language.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return normalized.startsWith('zh')
}

export function getWeComThinkingAckText(language?: string | null): string {
  return isChineseLanguage(language) ? '已收到，正在思考中...' : 'Received. Thinking...'
}

export function getWeComRestartConversationTitle(language?: string | null): string {
  return isChineseLanguage(language) ? '重置会话' : 'Restart Conversation'
}

export function getWeComStartNewChatLabel(language?: string | null): string {
  return isChineseLanguage(language) ? '开启新对话' : 'Start New Chat'
}

export function getWeComWelcomeTitle(language?: string | null): string {
  return isChineseLanguage(language) ? '欢迎使用智能助手' : 'Welcome to the assistant'
}

export function getWeComWelcomeDescription(language?: string | null): string {
  return isChineseLanguage(language)
    ? '如果想清空上下文重新开始，可以直接点击下方按钮。'
    : 'Use the button below any time you want to start fresh.'
}

export function getWeComNewConversationStartedText(language?: string | null): string {
  return isChineseLanguage(language)
    ? '已开启新会话，请继续提问'
    : 'New conversation started. Please continue asking.'
}

export function getWeComCompletedFallbackText(language?: string | null): string {
  return isChineseLanguage(language) ? '[企业微信回复]\n已处理完成。' : '[WeCom reply]\nProcessed.'
}

export function getWeComInterruptedFallbackText(language?: string | null): string {
  return isChineseLanguage(language)
    ? '[企业微信对话已中断]\n当前对话已中断。'
    : '[WeCom conversation interrupted]\nThe conversation was interrupted.'
}

export function formatWeComConversationFailedText(language: string | null | undefined, message: string): string {
  return isChineseLanguage(language) ? `[企业微信对话失败]\n${message}` : `[WeCom conversation failed]\n${message}`
}

export function formatWeComConversationErrorText(language: string | null | undefined, message: string): string {
  return isChineseLanguage(language) ? `[企业微信对话异常]\n${message}` : `[WeCom conversation error]\n${message}`
}

export function getWeComTriggerBindingMissingText(language?: string | null): string {
  return isChineseLanguage(language)
    ? '当前企业微信集成未绑定触发器，请先在工作流中绑定企业微信触发器。'
    : 'This WeCom integration is not bound to a trigger. Please bind a WeCom trigger in the workflow first.'
}

export function getWeComAvailableTriggerMissingText(language?: string | null): string {
  return isChineseLanguage(language)
    ? '当前企业微信集成未绑定可用触发器，请先在工作流中绑定企业微信触发器。'
    : 'This WeCom integration is not bound to an available trigger. Please bind a WeCom trigger in the workflow first.'
}
