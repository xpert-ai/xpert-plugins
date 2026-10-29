import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import {
  AssistantTaskRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareAssistantTaskResult,
  type AgentMiddlewareAssistantTaskStatusInput,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { ComplaintCaseService } from './complaint-case.service.js'
import type { ComplaintScope } from './domain/complaint.types.js'
import { COMPLAINT_TRIAGE_TOOL_NAME } from './constants.js'
import { safeComplaintErrorMessage } from './domain/complaint-errors.js'

export type ComplaintRuntimeProbeReference = Pick<
  AgentMiddlewareAssistantTaskStatusInput,
  'taskId' | 'executionId' | 'conversationId' | 'threadId' | 'clientMessageId' | 'xpertId'
>

@Injectable()
export class ComplaintAssistantTaskService {
  constructor(
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities: RuntimeCapabilityRegistry,
    private readonly cases: ComplaintCaseService
  ) {}

  async startCaseAnalysis(
    scope: ComplaintScope,
    xpertId: string,
    caseId: string,
    retry = false
  ) {
    const entity = retry
      ? await this.cases.retryAnalysis(scope, caseId)
      : await this.cases.beginAnalysis(scope, caseId)
    const attemptId = entity.attemptId!
    const clientMessageId = `complaint-analysis:${caseId}:${attemptId}`
    let task: AgentMiddlewareAssistantTaskResult
    try {
      task = await this.assistantTasks().startTask({
        xpertId,
        clientMessageId,
        prompt: buildComplaintAnalysisPrompt(entity, attemptId),
        humanInput: {
          purpose: 'complaint_triage_analysis',
          caseId,
          attemptId
        },
        correlation: {
          namespace: 'complaint_triage_analysis',
          operationId: attemptId,
          subjectId: caseId,
          attributes: { attemptId }
        }
      })
    } catch (error) {
      const message = safeTaskError(error)
      await this.cases.failAnalysis(
        scope,
        caseId,
        attemptId,
        'assistant_task_start_failed',
        message
      )
      throw new ServiceUnavailableException(message)
    }
    const updated = await this.cases.recordTaskReference(scope, caseId, attemptId, task)
    return { case: updated, task }
  }

  async reconcileCaseAnalysis(scope: ComplaintScope, caseId: string) {
    let entity = await this.cases.getCase(scope, caseId)
    if (entity.status !== 'PROCESSING' || !entity.attemptId) return { case: entity, task: null }
    const task = await this.getRuntimeProbeStatus({
      taskId: entity.assistantTaskId ?? undefined,
      executionId: entity.executionId ?? undefined,
      conversationId: entity.conversationId ?? undefined,
      threadId: entity.threadId ?? undefined,
      xpertId: undefined
    })
    if (!task) return { case: entity, task: null }
    if (task.status === 'failed' || task.status === 'interrupted') {
      entity = await this.cases.failAnalysis(
        scope,
        caseId,
        entity.attemptId,
        `assistant_task_${task.status}`,
        task.errorMessage ?? 'AI analysis did not complete. Please retry.'
      )
    } else if (task.status === 'succeeded') {
      entity = await this.cases.getCase(scope, caseId)
      if (entity.status === 'PROCESSING') {
        entity = await this.cases.failAnalysis(
          scope,
          caseId,
          entity.attemptId!,
          'analysis_result_missing',
          'AI processing finished without submitting a structured triage result. Please retry.'
        )
      }
    }
    return { case: entity, task }
  }

  async startRuntimeProbe(xpertId: string): Promise<AgentMiddlewareAssistantTaskResult> {
    const clientMessageId = `complaint-runtime-probe:${randomUUID()}`
    return this.assistantTasks().startTask({
      xpertId,
      clientMessageId,
      prompt: 'Runtime verification only. Reply with exactly COMPLAINT_ASSISTANT_TASK_OK and no additional text.',
      humanInput: {
        purpose: 'complaint_triage_runtime_probe'
      },
      correlation: {
        namespace: 'complaint_triage_runtime_probe',
        operationId: clientMessageId,
        subjectId: xpertId
      }
    })
  }

  async getRuntimeProbeStatus(
    reference: ComplaintRuntimeProbeReference
  ): Promise<AgentMiddlewareAssistantTaskResult | null> {
    const tasks = this.assistantTasks()
    if (!tasks.getTaskStatus) {
      throw new ServiceUnavailableException('Assistant Task status capability is unavailable.')
    }
    const result = await tasks.getTaskStatus(reference)
    return result?.errorMessage
      ? { ...result, errorMessage: safeComplaintErrorMessage(result.errorMessage) }
      : result
  }

  private assistantTasks() {
    return this.capabilities.require(AssistantTaskRuntimeCapability)
  }
}

function buildComplaintAnalysisPrompt(
  entity: {
    id: string
    customerName: string
    customerReference?: string | null
    complaintContent: string
  },
  attemptId: string
) {
  return [
    'Analyze this customer complaint for a customer-service specialist.',
    `You must call the ${COMPLAINT_TRIAGE_TOOL_NAME} tool exactly once.`,
    'Do not claim the complaint is confirmed; a human owns final confirmation.',
    `caseId: ${entity.id}`,
    `attemptId: ${attemptId}`,
    `customerName: ${entity.customerName}`,
    `customerReference: ${entity.customerReference ?? 'not provided'}`,
    'complaintContent:',
    entity.complaintContent
  ].join('\n')
}

function safeTaskError(error: unknown) {
  if (!(error instanceof Error)) return 'AI analysis could not be started. Please retry.'
  return safeComplaintErrorMessage(error.message)
}
