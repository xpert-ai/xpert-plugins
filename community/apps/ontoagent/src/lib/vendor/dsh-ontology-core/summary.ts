/**
 * 摘要端口（纯类型）：记忆目录/读取的导航摘要。摘要不是事实源，原文仍是唯一证据。
 * 真实实现由宿主经 agentgateway/通用模型适配；core/plugin 不 import 网络或模型 SDK。
 */
export interface SummaryRequest {
  text: string
  purpose?: 'card' | 'read'
  maxChars?: number
}

export interface SummaryResult {
  text: string
  model?: string
}

export interface SummaryPort {
  summarize(request: SummaryRequest): Promise<SummaryResult> | SummaryResult
}
