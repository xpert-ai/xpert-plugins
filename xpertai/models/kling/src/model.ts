import { AiModelTypeEnum, type ICopilotModel, type ICopilotProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type AsyncAIGCModelClient,
  type AsyncAIGCModelQueryContext,
  type AsyncAIGCModelQueryResult,
  type AsyncAIGCModelSubmission,
  type TChatModelOptions,
  VideoGenerationModel
} from '@xpert-ai/plugin-sdk'
import { KlingClient } from './client.js'
import { KlingProviderStrategy } from './provider.strategy.js'
import type { KlingCredentials, KlingProviderTask, KlingVideoGenerationRequest } from './types.js'
import { normalizeKlingVideoObservation } from './usage.js'

export class KlingVideoModelClient
  implements AsyncAIGCModelClient<KlingVideoGenerationRequest, KlingProviderTask>
{
  constructor(private readonly client: KlingClient) {}

  async submit(input: KlingVideoGenerationRequest): Promise<AsyncAIGCModelSubmission<KlingProviderTask>> {
    const task = await this.client.createTask(input.path, input.payload)
    return { providerRequestId: task.id, data: task }
  }

  async query(
    providerRequestId: string,
    context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<KlingProviderTask>> {
    const task = await this.client.queryTask(providerRequestId)
    return {
      data: task,
      observation: normalizeKlingVideoObservation(task, context?.pricingDimensions)
    }
  }
}

@Injectable()
export class KlingVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: KlingProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: KlingCredentials): Promise<void> {
    if (!credentials?.api_key) throw new Error('Kling API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<KlingVideoGenerationRequest, KlingProviderTask> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('Kling model provider context is missing')
    return new KlingVideoModelClient(new KlingClient(readCredentials(copilot.modelProvider?.credentials)))
  }
}

function readCredentials(credentials: ICopilotProvider['credentials']): KlingCredentials {
  return {
    api_key: typeof credentials?.api_key === 'string' ? credentials.api_key : undefined,
    api_endpoint_host:
      typeof credentials?.api_endpoint_host === 'string' ? credentials.api_endpoint_host : undefined
  }
}
