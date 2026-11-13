/**
 * 界面文案目录（中 / 英）。组件里只用语义 key，不写 if (locale === 'zh')。
 * 中文目录是 key 的“标准”，英文目录必须有完全相同的 key（单测检查）。
 */
const zhHans = {
  'app.title': '提前交货缺料分析',
  'app.mockBadge': '模拟数据',
  'app.refresh': '刷新',
  'app.loadDemo': '载入演示请求',
  'app.loading': '加载中…',
  'list.title': '提前交货请求',
  'list.empty': '还没有提前交货请求。点“载入演示请求”可以载入三条示例订单。',
  'list.orderNo': '订单号',
  'list.customer': '客户',
  'list.product': '产品',
  'list.dates': '目标交期（原交期）',
  'list.status': '状态',
  'list.shortages': '缺料数',
  'detail.empty': '在左侧选择一条请求查看详情。',
  'detail.attempt': '第 {seq} 次分析',
  'detail.startAnalysis': 'AI 分析',
  'detail.retry': '重试',
  'detail.reanalyse': '重新分析',
  'detail.analyzing': '正在分析（已用 {elapsed}）。可在左侧对话中查看智能体的每一步，超过 3 分钟未完成将提示重试。',
  'detail.failed': '分析失败：{reason}。本次未保存任何结论，可以重试。',
  'detail.summary': 'AI 总结论',
  'detail.recommendedDate': '建议交期 {date}',
  'detail.findings': '缺料清单（{count} 条）',
  'detail.noShortage': '没有缺料物料。',
  'detail.material': '物料',
  'detail.required': '需求',
  'detail.available': '可用',
  'detail.shortage': '缺口',
  'detail.suggestion': '建议',
  'detail.rationale': '说明',
  'detail.rawData': '原始数据（调试用）',
  'detail.finalDate': '最终交期 {date}',
  'detail.rejectReason': '驳回原因：{reason}',
  'notice.sent': '分析指令已发送到对话。',
  'notice.alreadyRunning': '这条请求已经在分析中。',
  'notice.sendFailed': '分析已创建，但指令没能发送到对话（{code}）。请检查对话面板后重试。',
  'notice.seeded': '已载入 {count} 条演示请求。',
  'status.draft': '草稿',
  'status.analyzing': '分析中',
  'status.failed': '分析失败',
  'status.pending_review': '待确认',
  'status.confirmed': '已确认',
  'status.rejected': '已驳回',
  'feasibility.feasible': '可行',
  'feasibility.conditional': '有条件可行',
  'feasibility.infeasible': '不可行',
  'suggestion.expedite': '催料',
  'suggestion.substitute': '替代料',
  'suggestion.reschedule': '调整交期',
  'suggestion.no_action': '无需处理',
  'error.INVENTORY_UNAVAILABLE': '库存系统暂时无法访问',
  'error.ANALYSIS_TIMEOUT': '智能体 3 分钟内没有完成分析',
  'error.DATA_INCOMPLETE': '数据不完整',
  'error.OTHER': '其他原因',
  'error.INVALID_STATE': '当前状态不允许这个操作',
  'error.NOT_FOUND': '记录不存在或已被删除',
  'error.CONFLICT': '数据已被其他操作更新，请刷新后再试',
  'error.generic': '操作失败（{code}）'
} as const

export type MessageKey = keyof typeof zhHans
type Catalog = Record<MessageKey, string>

const enUS: Catalog = {
  'app.title': 'Expedite shortage analysis',
  'app.mockBadge': 'Mock data',
  'app.refresh': 'Refresh',
  'app.loadDemo': 'Load demo requests',
  'app.loading': 'Loading…',
  'list.title': 'Expedite requests',
  'list.empty': 'No expedite requests yet. Click "Load demo requests" to add three sample orders.',
  'list.orderNo': 'Order',
  'list.customer': 'Customer',
  'list.product': 'Product',
  'list.dates': 'Target (original)',
  'list.status': 'Status',
  'list.shortages': 'Shortages',
  'detail.empty': 'Select a request on the left to see details.',
  'detail.attempt': 'Analysis #{seq}',
  'detail.startAnalysis': 'AI analysis',
  'detail.retry': 'Retry',
  'detail.reanalyse': 'Re-analyse',
  'detail.analyzing': 'Analysing ({elapsed} elapsed). Follow each step in the chat; you can retry if it takes longer than 3 minutes.',
  'detail.failed': 'Analysis failed: {reason}. No findings were saved; you can retry.',
  'detail.summary': 'AI conclusion',
  'detail.recommendedDate': 'Recommended date {date}',
  'detail.findings': 'Shortages ({count})',
  'detail.noShortage': 'No material is short.',
  'detail.material': 'Material',
  'detail.required': 'Required',
  'detail.available': 'Available',
  'detail.shortage': 'Gap',
  'detail.suggestion': 'Suggestion',
  'detail.rationale': 'Rationale',
  'detail.rawData': 'Raw data (debug)',
  'detail.finalDate': 'Final date {date}',
  'detail.rejectReason': 'Rejected: {reason}',
  'notice.sent': 'The analysis request was sent to the chat.',
  'notice.alreadyRunning': 'This request is already being analysed.',
  'notice.sendFailed': 'The analysis was created but the request could not be sent to the chat ({code}). Check the chat panel and retry.',
  'notice.seeded': 'Loaded {count} demo requests.',
  'status.draft': 'Draft',
  'status.analyzing': 'Analysing',
  'status.failed': 'Failed',
  'status.pending_review': 'Pending review',
  'status.confirmed': 'Confirmed',
  'status.rejected': 'Rejected',
  'feasibility.feasible': 'Feasible',
  'feasibility.conditional': 'Conditionally feasible',
  'feasibility.infeasible': 'Infeasible',
  'suggestion.expedite': 'Expedite',
  'suggestion.substitute': 'Substitute',
  'suggestion.reschedule': 'Reschedule',
  'suggestion.no_action': 'No action',
  'error.INVENTORY_UNAVAILABLE': 'the inventory service is unavailable',
  'error.ANALYSIS_TIMEOUT': 'the assistant did not finish within 3 minutes',
  'error.DATA_INCOMPLETE': 'data is incomplete',
  'error.OTHER': 'other reason',
  'error.INVALID_STATE': 'This action is not allowed in the current status',
  'error.NOT_FOUND': 'The record no longer exists',
  'error.CONFLICT': 'The data was changed by another action; refresh and try again',
  'error.generic': 'Action failed ({code})'
}

export const catalogs = { 'zh-Hans': zhHans as Catalog, 'en-US': enUS }
export type UiLocale = keyof typeof catalogs

/** 宿主语言 → 界面语言：简体中文用中文目录；繁体等其他语言回退英文（不把繁体当简体） */
export function normalizeLocale(locale: string | undefined): UiLocale {
  if (!locale) return 'zh-Hans'
  const value = locale.replace('_', '-').toLowerCase()
  if (value === 'zh' || value === 'zh-hans' || value === 'zh-cn' || value === 'zh-sg') return 'zh-Hans'
  return 'en-US'
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function createTranslator(locale: UiLocale): Translate {
  const catalog = catalogs[locale]
  return (key, params = {}) => catalog[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** 动态 key（状态、错误码）在目录里不存在时回退到通用文案 */
export function hasKey(key: string): key is MessageKey {
  return key in zhHans
}
