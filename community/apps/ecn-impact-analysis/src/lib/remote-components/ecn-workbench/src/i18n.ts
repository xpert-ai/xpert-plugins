import { createContext, useContext } from 'react'
import type { EcnAssessmentStatus, EcnChangeType, EcnImpactDomain, EcnRiskLevel } from '../../../contracts'

/**
 * Typed i18n facade. Components call semantic keys through useI18n();
 * locale branching stays inside this module only (xpert-agentic-app-developer
 * i18n standard).
 */
export type Locale = 'zh-Hans' | 'en-US'

const ALIASES: Record<string, Locale> = {
  'zh-cn': 'zh-Hans',
  'zh_hans': 'zh-Hans',
  'zh-hans-cn': 'zh-Hans',
  'zh': 'zh-Hans',
  'en_us': 'en-US',
  'en': 'en-US'
}

export function normalizeLocale(raw?: string): Locale {
  const value = (raw ?? '').toLowerCase()
  if (ALIASES[value]) return ALIASES[value]!
  if (value.startsWith('zh')) return 'zh-Hans'
  return 'en-US'
}

const zhHans = {
  appTitle: '变更影响评估台',
  appSubtitle: '工程变更（ECN）影响分析',
  mockBadge: '模拟数据',
  refresh: '刷新',
  newAssessment: '新建评估',
  sendToChat: '发送到对话',
  retry: '重新分析',
  confirm: '确认评估',
  archive: '归档',
  accept: '采纳',
  reject: '驳回',
  cancel: '取消',
  create: '创建',
  close: '关闭',
  save: '保存',
  empty: '暂无评估单',
  emptyHint: '在对话中描述工程变更，或点击右上角「新建评估」开始第一次影响分析。',
  loading: '加载中…',
  error: '出错了',
  retryAction: '重试',
  searchPlaceholder: '按变更单号搜索',
  statusFilterAll: '全部状态',
  colChange: '变更单',
  colMaterial: '变更对象',
  colStatus: '状态',
  colRisk: '风险',
  colItems: '影响项',
  colTime: '更新时间',
  status_draft: '待分析',
  status_analyzing: '分析中',
  status_ai_completed: '待人工确认',
  status_confirmed: '已确认',
  status_closed: '已归档',
  item_pending: '待审核',
  item_accepted: '已采纳',
  item_rejected: '已驳回',
  risk_high: '高',
  risk_medium: '中',
  risk_low: '低',
  domain_bom: 'BOM 父件',
  domain_routing: '工艺路线',
  domain_production: '在制工单',
  domain_inventory: '库存',
  changeInfo: '变更信息',
  changeType: '变更类型',
  changeType_material: '材料变更',
  changeType_dimension: '尺寸/公差',
  changeType_structure: '结构/BOM',
  changeType_process: '工艺变更',
  changeType_other: '其他',
  changeDescription: '变更内容',
  changeReason: '变更原因',
  aiSummary: 'AI 分析摘要',
  aiRisk: '整体风险',
  confidence: '置信度',
  evidence: '证据',
  impactItems: '影响项清单',
  pendingTip: (n: number) => `还有 ${n} 条影响项待处理`,
  allReviewedTip: '全部影响项已审核，可确认评估',
  reviewNotePlaceholder: '审核备注（可选）',
  lastError: '最近一次失败原因',
  retryCount: '重试次数',
  confirmedBy: '确认人',
  operationLog: '操作日志',
  noSelection: '左侧选择一个评估单查看详情',
  newItem: '新增',
  updatedItems: '更新',
  keptItems: '保留人工结论',
  selectMaterial: '物料号',
  selectMaterialPlaceholder: '例如 P-1003',
  inputChangeDescription: '变更内容（必填）',
  inputChangeDescriptionPlaceholder: '例如：材料由 HT200 改为 HT250，常温强度不足',
  inputChangeReason: '变更原因（可选）',
  inputChangeNo: '变更单号（选填，留空自动生成）',
  inputChangeType: '变更类型',
  createHint: '创建后可「发送到对话」让 AI 开始影响分析。',
  dialogNewTitle: '新建变更评估',
  sendAfterCreate: '创建并开始分析',
  systemNotice: '演示环境：PLM/ERP/MES 数据为本地模拟；生产部署时通过系统网关接入真实系统。'
} as const

export type MessageKey = {
  [K in keyof typeof zhHans]: (typeof zhHans)[K] extends (...args: never[]) => string ? K : K
}[keyof typeof zhHans]

const enUs: Record<keyof typeof zhHans, string | ((...args: never[]) => string)> = {
  appTitle: 'ECN Impact Review Desk',
  appSubtitle: 'Engineering change impact analysis',
  mockBadge: 'Mock data',
  refresh: 'Refresh',
  newAssessment: 'New Assessment',
  sendToChat: 'Send to Assistant',
  retry: 'Retry Analysis',
  confirm: 'Confirm',
  archive: 'Archive',
  accept: 'Accept',
  reject: 'Reject',
  cancel: 'Cancel',
  create: 'Create',
  close: 'Close',
  save: 'Save',
  empty: 'No assessments yet',
  emptyHint: 'Describe an engineering change in the chat, or click "New Assessment" to start your first impact analysis.',
  loading: 'Loading…',
  error: 'Something went wrong',
  retryAction: 'Retry',
  searchPlaceholder: 'Search by change number',
  statusFilterAll: 'All statuses',
  colChange: 'Change',
  colMaterial: 'Material',
  colStatus: 'Status',
  colRisk: 'Risk',
  colItems: 'Items',
  colTime: 'Updated',
  status_draft: 'Draft',
  status_analyzing: 'Analyzing',
  status_ai_completed: 'Needs review',
  status_confirmed: 'Confirmed',
  status_closed: 'Archived',
  item_pending: 'Pending',
  item_accepted: 'Accepted',
  item_rejected: 'Rejected',
  risk_high: 'High',
  risk_medium: 'Medium',
  risk_low: 'Low',
  domain_bom: 'BOM parents',
  domain_routing: 'Routings',
  domain_production: 'Production orders',
  domain_inventory: 'Inventory',
  changeInfo: 'Change information',
  changeType: 'Type',
  changeType_material: 'Material',
  changeType_dimension: 'Dimension',
  changeType_structure: 'Structure/BOM',
  changeType_process: 'Process',
  changeType_other: 'Other',
  changeDescription: 'Change description',
  changeReason: 'Reason',
  aiSummary: 'AI analysis summary',
  aiRisk: 'Overall risk',
  confidence: 'Confidence',
  evidence: 'Evidence',
  impactItems: 'Impact items',
  pendingTip: (n: number) => `${n} item(s) pending review`,
  allReviewedTip: 'All items reviewed; ready to confirm',
  reviewNotePlaceholder: 'Review note (optional)',
  lastError: 'Last failure',
  retryCount: 'Retry count',
  confirmedBy: 'Confirmed by',
  operationLog: 'Operation log',
  noSelection: 'Select an assessment on the left to see details',
  newItem: 'new',
  updatedItems: 'updated',
  keptItems: 'kept human decisions',
  selectMaterial: 'Material no.',
  selectMaterialPlaceholder: 'e.g. P-1003',
  inputChangeDescription: 'Change description (required)',
  inputChangeDescriptionPlaceholder: 'e.g. Material HT200 → HT250 for higher strength',
  inputChangeReason: 'Reason (optional)',
  inputChangeNo: 'Change no. (optional, generated when empty)',
  inputChangeType: 'Change type',
  createHint: 'After creation, "Send to Assistant" starts the AI analysis.',
  dialogNewTitle: 'New impact assessment',
  sendAfterCreate: 'Create & analyze',
  systemNotice: 'Demo environment: PLM/ERP/MES data is mocked locally; production deployments integrate real systems through the gateway.'
}

type StaticKey = keyof typeof zhHans
type DynamicKey =
  | `status_${EcnAssessmentStatus}`
  | `risk_${EcnRiskLevel}`
  | `domain_${EcnImpactDomain}`
  | `changeType_${EcnChangeType}`
export type I18nKey = StaticKey | DynamicKey

export type I18nApi = {
  locale: Locale
  /** Plain string message by key (includes dynamic status_/risk_/domain_/changeType_ keys). */
  t: (key: I18nKey) => string
  /** Parameterized message (item counts). */
  tFn: (key: 'pendingTip', count: number) => string
}

export function createI18n(locale: Locale): I18nApi {
  const catalog = (locale === 'zh-Hans' ? zhHans : enUs) as Record<string, string | ((count: number) => string)>
  return {
    locale,
    t: (key) => {
      const value = catalog[key]
      return typeof value === 'string' ? value : key
    },
    tFn: (key, count) => {
      const value = catalog[key]
      return typeof value === 'function' ? value(count) : ''
    }
  }
}

export const I18nContext = createContext<I18nApi>(createI18n('zh-Hans'))

export function useI18n(): I18nApi {
  return useContext(I18nContext)
}
