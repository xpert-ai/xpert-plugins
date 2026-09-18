// One typed i18n facade for the Workbench. Components use semantic keys only; the zh-Hans catalog is
// the key schema and a unit test enforces en-US parity. The server returns language-neutral codes
// (status, failure and error codes) that are localized here, at the UI boundary.

const zhHans = {
  'app.title': '客诉分诊台',
  'app.loading': '正在连接工作台…',
  'app.hostUnavailable': '无法连接到 Xpert 宿主，请刷新页面后重试。',
  'common.cancel': '取消',
  'common.refresh': '刷新',
  'common.retryLoad': '重新加载',
  'common.loadFailed': '加载失败，请重试。',

  'list.new': '新建工单',
  'list.search': '搜索工单号、客户或内容',
  'list.all': '全部',
  'list.empty.title': '还没有客诉工单',
  'list.empty.body': '粘贴一条客户投诉原文，助手会抽取要素、按标准定级并起草回复，最后由你确认。',
  'list.empty.action': '新建第一条工单',
  'list.noMatch': '没有符合条件的工单。',
  'list.attempts': '分析 {count} 次',
  'list.prev': '上一页',
  'list.next': '下一页',
  'list.page': '第 {page} / {pages} 页 · 共 {total} 条',

  'status.draft': '待分析',
  'status.analyzing': '分析中',
  'status.pending_review': '待确认',
  'status.analysis_failed': '分析失败',
  'status.confirmed': '已确认',

  'channel.ecommerce': '电商平台',
  'channel.email': '客服邮箱',
  'channel.phone': '电话记录',
  'channel.other': '其他',

  'category.safety': '安全问题',
  'category.product_quality': '产品质量',
  'category.logistics': '物流配送',
  'category.refund_return': '退款退换',
  'category.service_attitude': '服务态度',
  'category.billing': '计费发票',
  'category.other': '其他',

  'severity.P1': 'P1 紧急',
  'severity.P2': 'P2 高',
  'severity.P3': 'P3 中',
  'severity.P4': 'P4 低',
  'severity.sla': '{hours} 小时内响应',

  'sentiment.angry': '愤怒',
  'sentiment.dissatisfied': '不满',
  'sentiment.neutral': '平和',

  'create.title': '新建客诉工单',
  'create.content': '客诉原文',
  'create.contentHint': '粘贴客户的原话，{min}–{max} 字。',
  'create.contentCount': '{count} / {max}',
  'create.channel': '来源渠道',
  'create.customer': '客户称呼（选填）',
  'create.sample': '填入示例',
  'create.demo': '演示选项',
  'create.faultInjection': '首次分析注入故障（用于验证“失败后重试”，结果不会保存）',
  'create.submit': '创建工单',
  'create.error.tooShort': '客诉原文至少需要 {min} 个字。',
  'create.error.tooLong': '客诉原文不能超过 {max} 个字。',
  'create.error.customerTooLong': '客户称呼不能超过 60 个字。',

  'detail.pick': '从左侧选择一条工单，或新建一条。',
  'detail.customer': '客户',
  'detail.anonymous': '未填写',
  'detail.createdAt': '创建于 {time}',
  'detail.original': '客诉原文',
  'detail.originalHint': '句子前的编号是证据编号；点击分析结果里的证据可在此高亮对应句子。',
  'detail.analyze': 'AI 分析',
  'detail.retry': '重试',
  'detail.reanalyze': '重新分析',
  'detail.faultBadge': '已开启故障注入',

  'banner.draft': '尚未分析。点击“AI 分析”，助手会读取原文并给出分诊建议。',
  'banner.analyzing': '助手正在分析（第 {attempt} 次），已等待 {seconds} 秒。超过 {timeout} 秒没有结果会判定为超时，届时可重试。',
  'banner.pending_review': 'AI 建议已生成，尚未生效。请核对、按需修改后点击“确认并保存”。',
  'banner.confirmed': '已由人工确认并保存（{time}）。',
  'banner.failed': '第 {attempt} 次分析失败：{reason}',
  'banner.failedHint': '工单和原文都已保留，重试不会产生重复的工单或分析结果。',

  'failure.timeout': '助手在限定时间内没有返回结果（可能是模型调用失败或对话被中断）。',
  'failure.dispatch_failed': '分析请求没能发送给助手，请确认右侧对话已就绪。',
  'failure.model_reported': '助手判断这段文字无法分诊。',
  'failure.simulated_downstream_failure': '保存分析结果时下游服务不可用（故障注入）。',

  'analysis.title': 'AI 分诊建议',
  'analysis.attempt': '第 {attempt} 次分析 · {time}',
  'analysis.category': '分类',
  'analysis.severity': '严重度',
  'analysis.severityReason': '定级依据',
  'analysis.sentiment': '客户情绪',
  'analysis.summary': '摘要',
  'analysis.demands': '客户诉求',
  'analysis.noDemands': '未提出明确诉求',
  'analysis.facts': '关键事实',
  'analysis.actions': '建议处理',
  'analysis.reply': '回复草稿',
  'analysis.evidence': '证据 {id}',
  'analysis.unverified': '无原文证据，请人工核实',
  'analysis.unknownIds': '助手引用了原文中不存在的句子编号（{ids}），已忽略。',

  'review.title': '人工确认',
  'review.category': '分类',
  'review.severity': '严重度',
  'review.summary': '摘要',
  'review.handling': '处理方案',
  'review.reply': '给客户的回复',
  'review.note': '复核备注（选填）',
  'review.submit': '确认并保存',
  'review.changed': 'AI 建议 {from} → 人工确认 {to}',
  'review.required': '摘要、处理方案和回复都不能为空。',
  'review.final': '确认结果',

  'history.title': '处理记录',
  'history.created': '创建工单',
  'history.attempt': '第 {attempt} 次分析',
  'history.confirmed': '人工确认',
  'attempt.running': '进行中',
  'attempt.succeeded': '成功',
  'attempt.failed': '失败',
  'attempt.superseded': '已被重新分析取代',

  'prompt.analyze': '请分析客诉工单 {ticketNo}',

  'error.not_found': '工单不存在，可能已被删除。',
  'error.invalid_input': '输入不符合要求，请检查后重试。',
  'error.invalid_state': '工单当前状态不允许这个操作，已为你刷新。',
  'error.already_confirmed': '这条工单已经确认，不能再修改。',
  'error.stale_view': '分析结果已更新，请核对最新结果后再确认。',
  'error.conflict': '有其他人同时操作了这条工单，请刷新后重试。',
  'error.action_failed': '操作失败，请重试。',
  'error.host_timeout': '宿主响应超时，请重试。',
  'error.host_request_failed': '请求被宿主拒绝，请刷新页面后重试。'
} as const

export type MessageKey = keyof typeof zhHans
type Catalog = Record<MessageKey, string>

const enUS: Catalog = {
  'app.title': 'Complaint Triage',
  'app.loading': 'Connecting to the workbench…',
  'app.hostUnavailable': 'Cannot reach the Xpert host. Reload the page and try again.',
  'common.cancel': 'Cancel',
  'common.refresh': 'Refresh',
  'common.retryLoad': 'Reload',
  'common.loadFailed': 'Loading failed. Please try again.',

  'list.new': 'New ticket',
  'list.search': 'Search ticket no., customer or text',
  'list.all': 'All',
  'list.empty.title': 'No complaint tickets yet',
  'list.empty.body': 'Paste a customer complaint. The Assistant extracts the facts, grades it by policy and drafts a reply; you confirm.',
  'list.empty.action': 'Create the first ticket',
  'list.noMatch': 'No tickets match the filter.',
  'list.attempts': '{count} analyses',
  'list.prev': 'Previous',
  'list.next': 'Next',
  'list.page': 'Page {page} of {pages} · {total} tickets',

  'status.draft': 'Not analyzed',
  'status.analyzing': 'Analyzing',
  'status.pending_review': 'Needs review',
  'status.analysis_failed': 'Analysis failed',
  'status.confirmed': 'Confirmed',

  'channel.ecommerce': 'E-commerce',
  'channel.email': 'Email',
  'channel.phone': 'Phone',
  'channel.other': 'Other',

  'category.safety': 'Safety',
  'category.product_quality': 'Product quality',
  'category.logistics': 'Logistics',
  'category.refund_return': 'Refund / return',
  'category.service_attitude': 'Service attitude',
  'category.billing': 'Billing',
  'category.other': 'Other',

  'severity.P1': 'P1 Urgent',
  'severity.P2': 'P2 High',
  'severity.P3': 'P3 Medium',
  'severity.P4': 'P4 Low',
  'severity.sla': 'respond within {hours} h',

  'sentiment.angry': 'Angry',
  'sentiment.dissatisfied': 'Dissatisfied',
  'sentiment.neutral': 'Neutral',

  'create.title': 'New complaint ticket',
  'create.content': 'Complaint text',
  'create.contentHint': 'Paste the customer’s own words, {min}–{max} characters.',
  'create.contentCount': '{count} / {max}',
  'create.channel': 'Channel',
  'create.customer': 'Customer name (optional)',
  'create.sample': 'Use sample',
  'create.demo': 'Demo options',
  'create.faultInjection': 'Inject a failure into the first analysis (to verify retry; nothing is saved)',
  'create.submit': 'Create ticket',
  'create.error.tooShort': 'The complaint needs at least {min} characters.',
  'create.error.tooLong': 'The complaint cannot exceed {max} characters.',
  'create.error.customerTooLong': 'The customer name cannot exceed 60 characters.',

  'detail.pick': 'Pick a ticket on the left, or create one.',
  'detail.customer': 'Customer',
  'detail.anonymous': 'Not provided',
  'detail.createdAt': 'Created {time}',
  'detail.original': 'Original complaint',
  'detail.originalHint': 'The tag before each sentence is its evidence id; click evidence in the analysis to highlight it here.',
  'detail.analyze': 'Analyze with AI',
  'detail.retry': 'Retry',
  'detail.reanalyze': 'Re-analyze',
  'detail.faultBadge': 'Fault injection on',

  'banner.draft': 'Not analyzed yet. Press “Analyze with AI” and the Assistant will read the text and suggest a triage.',
  'banner.analyzing': 'The Assistant is analyzing (attempt {attempt}), {seconds}s so far. After {timeout}s without a result it times out and can be retried.',
  'banner.pending_review': 'The AI suggestion is ready but not in effect. Check it, edit as needed, then press “Confirm and save”.',
  'banner.confirmed': 'Confirmed and saved by a reviewer ({time}).',
  'banner.failed': 'Attempt {attempt} failed: {reason}',
  'banner.failedHint': 'The ticket and its text are kept. Retrying never creates a duplicate ticket or analysis.',

  'failure.timeout': 'The Assistant returned no result in time (the model call may have failed or the chat was interrupted).',
  'failure.dispatch_failed': 'The request could not be handed to the Assistant. Make sure the chat on the right is ready.',
  'failure.model_reported': 'The Assistant decided this text cannot be triaged.',
  'failure.simulated_downstream_failure': 'The downstream service was unavailable while saving the analysis (fault injection).',

  'analysis.title': 'AI triage suggestion',
  'analysis.attempt': 'Attempt {attempt} · {time}',
  'analysis.category': 'Category',
  'analysis.severity': 'Severity',
  'analysis.severityReason': 'Grading rule',
  'analysis.sentiment': 'Sentiment',
  'analysis.summary': 'Summary',
  'analysis.demands': 'Customer demands',
  'analysis.noDemands': 'No explicit demand',
  'analysis.facts': 'Key facts',
  'analysis.actions': 'Suggested actions',
  'analysis.reply': 'Reply draft',
  'analysis.evidence': 'Evidence {id}',
  'analysis.unverified': 'No evidence in the text — verify manually',
  'analysis.unknownIds': 'The Assistant cited sentence ids that do not exist ({ids}); they were ignored.',

  'review.title': 'Human review',
  'review.category': 'Category',
  'review.severity': 'Severity',
  'review.summary': 'Summary',
  'review.handling': 'Handling plan',
  'review.reply': 'Reply to the customer',
  'review.note': 'Reviewer note (optional)',
  'review.submit': 'Confirm and save',
  'review.changed': 'AI suggested {from} → reviewer confirmed {to}',
  'review.required': 'Summary, handling plan and reply are required.',
  'review.final': 'Confirmed result',

  'history.title': 'History',
  'history.created': 'Ticket created',
  'history.attempt': 'Analysis attempt {attempt}',
  'history.confirmed': 'Confirmed by reviewer',
  'attempt.running': 'running',
  'attempt.succeeded': 'succeeded',
  'attempt.failed': 'failed',
  'attempt.superseded': 'superseded by a re-analysis',

  'prompt.analyze': 'Please analyze complaint ticket {ticketNo}',

  'error.not_found': 'The ticket no longer exists.',
  'error.invalid_input': 'The input is invalid. Please check and try again.',
  'error.invalid_state': 'The ticket’s status does not allow this action. The view was refreshed.',
  'error.already_confirmed': 'This ticket is already confirmed and cannot be changed.',
  'error.stale_view': 'The analysis changed. Review the latest result before confirming.',
  'error.conflict': 'Someone else changed this ticket at the same time. Refresh and try again.',
  'error.action_failed': 'The action failed. Please try again.',
  'error.host_timeout': 'The host did not respond in time. Please try again.',
  'error.host_request_failed': 'The host rejected the request. Reload the page and try again.'
}

export const catalogs = { 'zh-Hans': zhHans as Catalog, 'en-US': enUS }
export type Locale = keyof typeof catalogs

// Explicit BCP 47 aliases: Traditional Chinese must not silently fall into Simplified.
export function resolveLocale(hostLocale: string): Locale {
  const normalized = hostLocale.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-sg' || normalized.startsWith('zh-hans')) return 'zh-Hans'
  return 'en-US'
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function createTranslator(locale: Locale): Translate {
  const catalog = catalogs[locale]
  return (key, params) => catalog[key].replace(/\{(\w+)\}/g, (placeholder, name: string) => (params && name in params ? String(params[name]) : placeholder))
}

export function createTimeFormatter(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  return (iso: string | null) => (iso ? formatter.format(new Date(iso)) : '')
}

// Codes arrive from the server as plain strings; fall back to a generic message for unknown ones.
export function isMessageKey(key: string): key is MessageKey {
  return key in zhHans
}
