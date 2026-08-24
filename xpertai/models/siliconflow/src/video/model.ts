import {
  AiModelTypeEnum,
  type ICopilotModel,
  type ICopilotProvider,
  type ModelUsagePricingSnapshot,
  type ModelUsagePricingContext
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type AsyncAIGCModelClient,
  type AsyncAIGCModelQueryContext,
  type AsyncAIGCModelQueryResult,
  type AsyncAIGCModelSubmission,
  type TChatModelOptions,
  VideoGenerationModel
} from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { getBaseUrlFromCredentials, type SiliconflowCredentials } from '../types.js'
import { SiliconflowVideoClient } from './client.js'
import type {
  SiliconflowVideoCredentials,
  SiliconflowVideoGenerationPayload,
  SiliconflowVideoTask
} from './types.js'
import { normalizeSiliconflowVideoObservation } from './usage.js'

export class SiliconflowVideoModelClient
  implements AsyncAIGCModelClient<SiliconflowVideoGenerationPayload, SiliconflowVideoTask>
{
  constructor(private readonly client: SiliconflowVideoClient) {}

  async submit(input: SiliconflowVideoGenerationPayload): Promise<AsyncAIGCModelSubmission<SiliconflowVideoTask>> {
    const task = await this.client.submitVideo(input)
    const providerRequestId = task.requestId?.trim()
    if (!providerRequestId) throw new Error('SiliconFlow did not return a requestId')
    return { providerRequestId, data: task }
  }

  async query(
    providerRequestId: string,
    _context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<SiliconflowVideoTask>> {
    const task = await this.client.getVideoTask(providerRequestId)
    return { data: task, observation: normalizeSiliconflowVideoObservation(task) }
  }
}

@Injectable()
export class SiliconflowVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: SiliconflowVideoCredentials): Promise<void> {
    if (!credentials?.api_key) throw new Error('SiliconFlow API key is missing')
  }

  override getUsagePricingSnapshot(
    model: string,
    credentials: Record<string, unknown>,
    context: ModelUsagePricingContext
  ): ModelUsagePricingSnapshot {
    const baseUrl = getBaseUrlFromCredentials(readCredentials(credentials))
    const market =
      baseUrl === 'https://api.siliconflow.cn/v1'
        ? 'cn'
        : baseUrl === 'https://api.siliconflow.com/v1'
          ? 'global'
          : 'custom'
    return super.getUsagePricingSnapshot(model, credentials, {
      ...context,
      pricingDimensions: { ...context.pricingDimensions, mode: market }
    })
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<SiliconflowVideoGenerationPayload, SiliconflowVideoTask> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('SiliconFlow model provider context is missing')
    return new SiliconflowVideoModelClient(
      new SiliconflowVideoClient(readCredentials(copilot.modelProvider?.credentials))
    )
  }
}

function readCredentials(credentials: ICopilotProvider['credentials'] | Record<string, unknown>): SiliconflowCredentials {
  return {
    api_key: typeof credentials?.api_key === 'string' ? credentials.api_key : '',
    endpoint_url: typeof credentials?.endpoint_url === 'string' ? credentials.endpoint_url : undefined,
    base_url: typeof credentials?.base_url === 'string' ? credentials.base_url : undefined,
    use_international_endpoint:
      typeof credentials?.use_international_endpoint === 'string' ||
      typeof credentials?.use_international_endpoint === 'boolean'
        ? credentials.use_international_endpoint
        : undefined
  }
}
