// The company's triage standard. It is handed to the model with every ticket so that grading follows
// the business rule set instead of the model's own notion of "serious", and it drives the review form.

export const CATEGORIES = [
  'safety',
  'product_quality',
  'logistics',
  'refund_return',
  'service_attitude',
  'billing',
  'other'
] as const
export type Category = (typeof CATEGORIES)[number]

export const SEVERITIES = ['P1', 'P2', 'P3', 'P4'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SENTIMENTS = ['angry', 'dissatisfied', 'neutral'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const CHANNELS = ['ecommerce', 'email', 'phone', 'other'] as const
export type Channel = (typeof CHANNELS)[number]

// Input limits live here (no zod import) so the Workbench bundle can share them with the server schema.
export const CONTENT_MIN_LENGTH = 10
export const CONTENT_MAX_LENGTH = 4000

// Written in the language of the business: the model quotes these rules in its grading reason, and
// the reviewer reads that reason. Keys stay stable English codes; only the rule text is localized.
export const CATEGORY_GUIDE: Record<Category, string> = {
  safety: '人身伤害、起火、冒烟、漏电、异常发热等任何安全隐患。',
  product_quality: '产品有缺陷、损坏或与描述不符，但不涉及安全隐患。',
  logistics: '发货或配送延误、丢件、错发、运输破损。',
  refund_return: '退款、退货、换货方面的争议。',
  service_attitude: '对客服或工作人员服务态度的投诉。',
  billing: '扣款错误、发票、优惠券等计费问题。',
  other: '不属于以上任何一类。'
}

export const SEVERITY_GUIDE: Record<Severity, { rule: string; responseWithinHours: number }> = {
  P1: {
    rule: '存在安全隐患或人身伤害；或客户明确表示要向监管部门投诉、向媒体或网络曝光、提起诉讼。',
    responseWithinHours: 2
  },
  P2: {
    rule: '产品完全无法使用；或就同一问题重复投诉；或涉及 1000 元及以上的退款争议。',
    responseWithinHours: 8
  },
  P3: {
    rule: '功能部分异常；发货或配送延误、运输破损；或服务态度问题。',
    responseWithinHours: 24
  },
  P4: {
    rule: '咨询、建议，或轻微不满。',
    responseWithinHours: 48
  }
}
