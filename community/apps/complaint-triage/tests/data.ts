import type { CreateTicketInput, SaveAnalysisInput, TicketScope } from '../src/lib/domain/contracts.js'

// Pure test data (types only from src): shared by the src-based and the dist-based tests.

export const scope: TicketScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a' }

// s1..s5 after splitting: the fixture analysis below cites these ids.
export const COMPLAINT =
  '我上周买的空气炸锅（订单号 8820260902115）用了不到两周，昨天底部突然冒烟。家里有小孩，这要是着火了谁负责？我联系过客服两次都没人回电。我要求全额退款 399 元。今天再不处理我就去 12315 投诉。'

export const ticketInput: CreateTicketInput = { content: COMPLAINT, channel: 'ecommerce', customerName: '李女士', faultInjection: 'none' }

// The shape a competent model naturally produces: flat judgments plus sentence ids, no quoted text.
export function analysisInput(ticketNo: string): SaveAnalysisInput {
  return {
    ticketNo,
    category: 'safety',
    severity: 'P1',
    severityReason: '产品冒烟属于安全隐患，且客户明确表示要向 12315 投诉，符合 P1。',
    severityEvidenceIds: ['s1', 's5'],
    sentiment: 'angry',
    summary: '空气炸锅使用两周后底部冒烟，客户两次联系客服无人回电，要求全额退款并威胁向 12315 投诉。',
    customerDemands: ['全额退款 399 元'],
    keyFacts: [
      { fact: '产品：空气炸锅，订单号 8820260902115', evidenceIds: ['s1'] },
      { fact: '两次联系客服均无人回电', evidenceIds: ['s3'] }
    ],
    suggestedActions: ['2 小时内由专员电话联系客户并致歉', '安排全额退款并回收问题产品', '同步质量部排查同批次产品'],
    replyDraft: '李女士您好，非常抱歉给您带来了惊吓和不便……'
  }
}
