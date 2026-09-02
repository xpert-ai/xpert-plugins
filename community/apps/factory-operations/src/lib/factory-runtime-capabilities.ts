import type {
  RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

export interface FactoryProjectExternalAssistantExpectation {
  pluginName: string
  templateKey: string
  agentKey: string
}

export interface FactoryProjectEnsureInput {
  projectId: string
  xpertId: string
  requesterAgentKey?: string
  externalAssistantExpectations?: FactoryProjectExternalAssistantExpectation[]
  name: string
  status: 'active' | 'archived'
}

export interface FactoryProjectEnsureResult {
  projectId: string
  xpertIds: string[]
  operation: 'created' | 'updated'
}

export interface FactoryProjectProvisioningApi {
  ensure(input: FactoryProjectEnsureInput): Promise<FactoryProjectEnsureResult>
}

export type FactoryAssistantTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'unknown'

export interface FactoryAssistantTaskInput {
  xpertId: string
  target: {
    kind: 'external_assistant'
    requesterXpertId: string
    requesterAgentKey: string
    expectation: FactoryProjectExternalAssistantExpectation
  }
  projectId: string
  taskId?: string
  clientMessageId?: string
  prompt: string
  humanInput: Record<string, string | number | boolean | null>
  context: Record<string, unknown>
  correlation: {
    namespace: string
    operationId: string
    subjectId: string
    attributes: Record<string, string | number | boolean | null>
  }
}

export interface FactoryAssistantTaskResult {
  status: FactoryAssistantTaskStatus
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  errorMessage?: string
  executorXpertId?: string
  executorAgentKey?: string
  executorAssistantTemplateKey?: string
  executorAssistantTitle?: string
  executorPublishedVersion?: string
}

export interface FactoryAssistantTaskApi {
  startTask(input: FactoryAssistantTaskInput): Promise<FactoryAssistantTaskResult>
  getTaskStatus?(input: {
    taskId?: string
    executionId?: string
    conversationId?: string
    threadId?: string
    clientMessageId?: string
    xpertId?: string
  }): Promise<FactoryAssistantTaskResult | null>
  cancelTask?(input: {
    taskId?: string
    executionId?: string
    conversationId?: string
    threadId?: string
    clientMessageId?: string
    xpertId?: string
  }): Promise<{ canceledExecutionIds: string[] }>
}

const PROJECT_PROVISIONING_CAPABILITY = 'platform.project.provisioning'
const ASSISTANT_TASK_CAPABILITY = 'platform.assistant_task'

/**
 * @deprecated Remove after the published plugin SDK exports the multi-Assistant
 * Project ensure and portable External Assistant Task contracts used here.
 */
export function requireFactoryProjectProvisioning(
  registry: RuntimeCapabilityRegistry
): FactoryProjectProvisioningApi {
  return registry.require<FactoryProjectProvisioningApi>(
    PROJECT_PROVISIONING_CAPABILITY
  )
}

/**
 * @deprecated Remove after the published plugin SDK exports the portable target,
 * correlation, and executor metadata fields used by the host runtime.
 */
export function requireFactoryAssistantTasks(
  registry: RuntimeCapabilityRegistry
): FactoryAssistantTaskApi {
  return registry.require<FactoryAssistantTaskApi>(ASSISTANT_TASK_CAPABILITY)
}
