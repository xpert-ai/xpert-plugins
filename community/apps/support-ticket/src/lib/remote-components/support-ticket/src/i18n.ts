/** Bilingual copy. Tuples are [zh-Hans, en-US]; every user visible string lives here. */
const DICT: Record<string, [string, string]> = {
  loading: ['正在加载工单工作台…', 'Loading Support Ticket Workbench…'],
  title: ['客服工单工作台', 'Support Ticket Workbench'],
  subtitle: ['AI 分类定级与回复草稿，人工确认后归档', 'AI triage and reply drafting, archived after human review'],
  refresh: ['刷新', 'Refresh'],
  newTicket: ['新建工单', 'New ticket'],
  ticketDetail: ['工单详情', 'Ticket detail'],
  statProcessing: ['AI 处理中', 'Processing'],
  statPendingReview: ['待确认', 'To review'],
  statConfirmed: ['已确认', 'Confirmed'],
  statFailed: ['失败', 'Failed'],
  searchPlaceholder: ['搜索工单号、客户或消息内容', 'Search ticket no, customer or message'],
  allStatuses: ['全部', 'All'],
  emptyList: ['暂无工单', 'No tickets yet'],
  emptyListHint: ['在右侧录入客户消息并提交，就会生成第一张工单。', 'Submit a customer message on the right to create the first ticket.'],
  noMatch: ['没有符合条件的工单', 'No ticket matches the current filter'],
  customer: ['客户名称', 'Customer'],
  customerPlaceholder: ['例如：杭州云启智能设备有限公司', 'e.g. Northwind Trading Ltd.'],
  channel: ['联系渠道', 'Channel'],
  message: ['客户原始消息', 'Customer message'],
  messagePlaceholder: [
    '把客户邮件或聊天记录原样粘贴进来，保留订单号、时间、现象等细节。',
    'Paste the original customer email or chat message, keep order numbers, timestamps and symptoms.'
  ],
  submit: ['提交并交给 AI 处理', 'Submit to AI'],
  submitting: ['正在提交…', 'Submitting…'],
  required: ['必填', 'Required'],
  messageTooLong: ['消息超出 {max} 字，请拆分后再提交', 'Message exceeds {max} characters, split it before submitting'],
  originalMessage: ['原始消息', 'Original message'],
  aiSection: ['AI 分类与草稿', 'AI triage and draft'],
  aiPending: ['AI 正在处理…', 'AI is processing…'],
  aiPendingHint: ['已等待 {seconds} 秒，超过 {timeout} 秒未返回将标记为失败并允许重试。', 'Waited {seconds}s. After {timeout}s it is marked failed and can be retried.'],
  waitingForTool: ['等待助手完成分类…', 'Waiting for the assistant tool result…'],
  category: ['问题类别', 'Category'],
  priority: ['优先级', 'Priority'],
  priorityReason: ['定级依据', 'Priority evidence'],
  draftReply: ['回复草稿', 'Reply draft'],
  confidence: ['置信度', 'Confidence'],
  missingInfo: ['待补充信息', 'Missing information'],
  reviewSection: ['人工校对与确认', 'Human review'],
  reviewerHint: [
    'AI 只提供建议，修改后点击「确认并归档」才会写入正式记录。',
    'AI output is a suggestion only. Click Confirm to turn edits into the official record.'
  ],
  saveDraft: ['保存草稿', 'Save draft'],
  saving: ['保存中…', 'Saving…'],
  confirm: ['确认并归档', 'Confirm and archive'],
  confirming: ['确认中…', 'Confirming…'],
  retry: ['重试 AI 处理', 'Retry AI processing'],
  retrying: ['重试中…', 'Retrying…'],
  markFailed: ['标记为失败', 'Mark failed'],
  confirmNeedsAi: ['需要先拿到 AI 结果才能确认。', 'An AI result is required before confirming.'],
  failureTitle: ['AI 处理失败', 'AI processing failed'],
  failureHint: ['客户消息与工单号已保留，重试不会重复创建工单或产生第二次业务结果。', 'The message and ticket number are kept. Retrying reuses this ticket instead of creating another one.'],
  code_invalid_input: ['输入不完整或超出限制，请按提示修正后重试。', 'The input is incomplete or out of range. Fix it and try again.'],
  code_ai_timeout: ['模型或助手未在规定时间内返回结果，请确认模型可用后重试。', 'The assistant did not return a result in time. Check the model and retry.'],
  code_ai_tool_error: ['助手调用工具时出错，请重试或联系管理员查看日志。', 'The assistant tool call failed. Retry or ask an administrator to check logs.'],
  code_already_confirmed: ['该工单已确认归档，不再重复处理。', 'This ticket is already confirmed and will not be processed again.'],
  code_revision_conflict: ['工单同时被其他人修改，你的修改仍保留在页面上，请刷新比对后重试。', 'Somebody else changed this ticket. Your edits are kept on screen; refresh, compare and retry.'],
  code_ticket_not_found: ['找不到该工单，可能已被删除或不属于当前组织。', 'Ticket not found in the current organization.'],
  code_unsupported_action: ['当前版本不支持该操作。', 'This action is not supported by the current version.'],
  attempt: ['第 {count} 次尝试', 'Attempt {count}'],
  revision: ['版本 r{revision}', 'Revision r{revision}'],
  timeline: ['操作记录', 'Activity'],
  agentRequestFailed: ['无法把消息发送给助手，请确认助手已配置可用模型后重试。', 'Could not hand the message to the assistant. Check the assistant model configuration and retry.'],
  noticeSubmitted: ['工单已提交，正在等待 AI 结果', 'Ticket submitted, waiting for the AI result'],
  noticeSubmittedDuplicate: ['已复用同一张工单，未重复创建', 'Reused the existing ticket instead of creating a duplicate'],
  noticeAiDone: ['已收到 AI 分类与草稿，请人工校对', 'AI triage and draft received, please review'],
  noticeDraftSaved: ['草稿已保存', 'Draft saved'],
  noticeConfirmed: ['工单已确认归档', 'Ticket confirmed and archived'],
  noticeRetried: ['已重新提交 AI 处理', 'AI processing restarted'],
  noticeRefreshed: ['已刷新', 'Refreshed'],
  loadFailed: ['工单数据加载失败，请点击刷新重试。', 'Failed to load tickets. Refresh to retry.'],
  event_submitted: ['创建工单', 'Ticket created'],
  event_ai_completed: ['AI 返回结果', 'AI result received'],
  event_ai_failed: ['AI 处理失败', 'AI processing failed'],
  event_retry_requested: ['发起重试', 'Retry requested'],
  event_draft_saved: ['保存人工修改', 'Reviewer edits saved'],
  event_confirmed: ['人工确认归档', 'Confirmed by reviewer'],
  untouched: ['与 AI 建议一致', 'Matches AI suggestion'],
  edited: ['人工已修改', 'Edited by reviewer'],
  finalReply: ['最终回复', 'Final reply'],
  priorityEvidence: ['优先级依据', 'Priority evidence']
}

export type Locale = 'zh-Hans' | 'en-US'

export function normalizeLocale(locale?: string): Locale {
  return locale?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-Hans'
}

export function createText(locale?: string) {
  const normalized = normalizeLocale(locale)
  const index = normalized === 'en-US' ? 1 : 0
  return (key: string, params?: Record<string, string | number>) => {
    const entry = DICT[key]
    const template = entry ? entry[index] : key
    if (!params) {
      return template
    }
    return Object.entries(params).reduce(
      (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
      template
    )
  }
}

export type Text = ReturnType<typeof createText>
