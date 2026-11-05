import type { ComplaintCategory, ComplaintDraftInput, ComplaintStatus, ComplaintUrgency, DraftEvaluation } from './types'

export const MIN_RAW_TEXT_LENGTH = 8
const ORDER_REQUIRED_CATEGORIES = new Set<ComplaintCategory>(['logistics', 'product', 'refund'])
const ESCALATION_PATTERN = /监管|12315|多次投诉|高额赔偿|消协/

export function normalizeText(value: string | undefined | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function evaluateDraft(input: ComplaintDraftInput): DraftEvaluation {
  const rawText = normalizeText(input.rawText) ?? ''
  const category = input.category
  const urgency = input.urgency ?? 'normal'
  const orderNo = normalizeText(input.orderNo)
  const contact = normalizeText(input.contact)
  const modelMissingFields = unique(input.missingFields?.map((item) => item.trim()).filter(Boolean) ?? [])
  const escalationSuggested = Boolean(input.escalationSuggested) || ESCALATION_PATTERN.test(rawText)
  const escalationReason = normalizeText(input.escalationReason) ?? (escalationSuggested ? '原文出现升级或多次投诉信号' : undefined)

  if (input.simulateModelFailure) {
    return {
      status: 'failed',
      validationErrors: [],
      failureReason: normalizeText(input.failureReason) ?? '模型调用失败，请在同一条受理单上重试',
      missingFields: modelMissingFields,
      escalationSuggested,
      escalationReason,
      category,
      urgency
    }
  }

  if (rawText.length < MIN_RAW_TEXT_LENGTH) {
    return {
      status: 'draft',
      validationErrors: ['客户原话过短，请补充具体问题、订单号和联系方式'],
      missingFields: unique([...modelMissingFields, '具体问题']),
      escalationSuggested,
      escalationReason,
      category,
      urgency
    }
  }

  const missingFields = [...modelMissingFields]
  if (!contact) missingFields.push('联系方式')
  if (category && ORDER_REQUIRED_CATEGORIES.has(category) && !orderNo) missingFields.push('订单号')
  if (!normalizeText(input.customerDemand)) missingFields.push('客户诉求')
  const uniqueMissing = unique(missingFields)

  if (!category || !normalizeText(input.customerDemand) || !normalizeText(input.suggestedReply)) {
    return {
      status: 'failed',
      validationErrors: [],
      failureReason: '模型结果无法解析，请在同一条受理单上重试',
      missingFields: uniqueMissing,
      escalationSuggested,
      escalationReason,
      category,
      urgency
    }
  }

  return {
    status: uniqueMissing.length ? 'needs_info' : 'ready',
    validationErrors: [],
    missingFields: uniqueMissing,
    escalationSuggested,
    escalationReason,
    category,
    urgency
  }
}

export function assertConfirmable(status: ComplaintStatus, missingFields: string[]) {
  if (status === 'confirmed') return
  if (status === 'failed') {
    throw new Error('模型处理失败，请先重试生成草稿')
  }
  if (status === 'draft') {
    throw new Error('请先生成可复核的受理草稿')
  }
  if (missingFields.length) {
    throw new Error(`还缺少：${missingFields.join('、')}`)
  }
  if (status !== 'ready' && status !== 'needs_info' && status !== 'returned') {
    throw new Error('当前状态不能确认受理')
  }
}

export function matchesScope(
  record: { tenantId?: string | null; organizationId?: string | null },
  scope: { tenantId?: string | null; organizationId?: string | null }
) {
  if (scope.tenantId && record.tenantId && record.tenantId !== scope.tenantId) return false
  if (scope.organizationId && record.organizationId && record.organizationId !== scope.organizationId) return false
  return true
}

export function scopeWhere(scope: { tenantId?: string | null; organizationId?: string | null }) {
  const where: { tenantId?: string; organizationId?: string } = {}
  if (scope.tenantId) where.tenantId = scope.tenantId
  if (scope.organizationId) where.organizationId = scope.organizationId
  return where
}

function unique(values: string[]) {
  return [...new Set(values)]
}

export function isComplaintCategory(value: string | undefined): value is ComplaintCategory {
  return value === 'logistics' || value === 'product' || value === 'refund' || value === 'service' || value === 'other'
}

export function isComplaintUrgency(value: string | undefined): value is ComplaintUrgency {
  return value === 'low' || value === 'normal' || value === 'high'
}
