/**
 * 实体 → 对外数据结构（DTO）的转换。
 * 对外（界面、模型）不暴露 tenantId、organizationId、createdById 等内部字段；时间统一转成 ISO 字符串。
 * Python 类比：pydantic 的 response_model，只挑要给前端看的字段。
 */
import type {
  AnalysisJobEntity,
  ExpediteRequestEntity,
  RequestLogEntity,
  ShortageFindingEntity
} from './entities/index.js'

const iso = (value: Date | null) => (value ? value.toISOString() : null)

export function toRequestDto(request: ExpediteRequestEntity, productName: string, shortageCount: number | null = null) {
  return {
    id: request.id,
    orderNo: request.orderNo,
    customerName: request.customerName,
    productCode: request.productCode,
    productName,
    quantity: request.quantity,
    originalDueDate: request.originalDueDate,
    targetDate: request.targetDate,
    remark: request.remark,
    status: request.status,
    demoFailInventoryOnce: request.demoFailInventoryOnce,
    currentJobId: request.currentJobId,
    jobCount: request.jobCount,
    finalFeasibility: request.finalFeasibility,
    finalDate: request.finalDate,
    finalNote: request.finalNote,
    rejectReason: request.rejectReason,
    decidedAt: iso(request.decidedAt),
    createdAt: iso(request.createdAt),
    updatedAt: iso(request.updatedAt),
    shortageCount
  }
}
export type RequestDto = ReturnType<typeof toRequestDto>

export function toJobDto(job: AnalysisJobEntity) {
  return {
    id: job.id,
    seq: job.seq,
    status: job.status,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    feasibility: job.feasibility,
    recommendedDate: job.recommendedDate,
    summary: job.summary,
    createdAt: iso(job.createdAt),
    startedAt: iso(job.startedAt),
    finishedAt: iso(job.finishedAt)
  }
}
export type JobDto = ReturnType<typeof toJobDto>

export function toFindingDto(finding: ShortageFindingEntity) {
  return {
    id: finding.id,
    jobId: finding.jobId,
    materialCode: finding.materialCode,
    materialName: finding.materialName,
    requiredQty: finding.requiredQty,
    availableQty: finding.availableQty,
    shortageQty: finding.shortageQty,
    evidence: finding.evidence,
    suggestionType: finding.suggestionType,
    suggestedDate: finding.suggestedDate,
    substituteCode: finding.substituteCode,
    rationale: finding.rationale,
    decision: finding.decision,
    decisionNote: finding.decisionNote,
    decidedAt: iso(finding.decidedAt)
  }
}
export type FindingDto = ReturnType<typeof toFindingDto>

export function toLogDto(log: RequestLogEntity) {
  return {
    id: log.id,
    jobId: log.jobId,
    actor: log.actor,
    action: log.action,
    summary: log.summary,
    createdAt: iso(log.createdAt)
  }
}
export type LogDto = ReturnType<typeof toLogDto>
