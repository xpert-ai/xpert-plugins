import { AiModelTypeEnum, type ICopilotModel, type ICopilotProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type AIGCModelClient,
  type AIGCModelResult,
  type AsyncAIGCModelClient,
  type AsyncAIGCModelQueryContext,
  type AsyncAIGCModelQueryResult,
  type AsyncAIGCModelSubmission,
  ImageGenerationModel,
  type TChatModelOptions,
  VideoGenerationModel
} from '@xpert-ai/plugin-sdk'
import { VolcengineProviderStrategy } from '../provider.strategy.js'
import type { VolcengineModelCredentials } from '../types.js'
import { SeedreamArkClient } from './client.js'
import type { SeedanceVideoTask, SeedreamImageResponse } from './types.js'
import { normalizeSeedanceVideoObservation, normalizeSeedreamImageObservation } from './usage.js'

export class SeedreamImageModelClient
  implements AIGCModelClient<Record<string, unknown>, SeedreamImageResponse>
{
  constructor(private readonly client: SeedreamArkClient) {}

  async invoke(input: Record<string, unknown>): Promise<AIGCModelResult<SeedreamImageResponse>> {
    const response = await this.client.generateImages(input)
    return {
      data: response,
      observation: normalizeSeedreamImageObservation(response)
    }
  }
}

export class SeedanceVideoModelClient
  implements AsyncAIGCModelClient<Record<string, unknown>, SeedanceVideoTask>
{
  constructor(private readonly client: SeedreamArkClient) {}

  async submit(input: Record<string, unknown>): Promise<AsyncAIGCModelSubmission<SeedanceVideoTask>> {
    const task = await this.client.createVideoTask(input)
    const providerRequestId = task.id?.trim()
    if (!providerRequestId) throw new Error('Ark API did not return a video task ID')
    return { providerRequestId, data: task }
  }

  async query(
    providerRequestId: string,
    _context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<SeedanceVideoTask>> {
    const task = await this.client.getVideoTask(providerRequestId)
    return { data: task, observation: normalizeSeedanceVideoObservation(task) }
  }
}

@Injectable()
export class VolcengineImageGenerationModel extends ImageGenerationModel {
  constructor(modelProvider: VolcengineProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.IMAGE)
  }

  async validateCredentials(_model: string, credentials: VolcengineModelCredentials): Promise<void> {
    if (!credentials?.ark_api_key) throw new Error('Ark API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AIGCModelClient<Record<string, unknown>, SeedreamImageResponse> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('Volcengine model provider context is missing')
    const model = copilotModel.model?.trim()
    if (!model) throw new Error('Seedream image model is missing')
    const rawCredentials = copilot.modelProvider?.credentials
    const credentials: VolcengineModelCredentials = {
      ark_api_key: typeof rawCredentials?.ark_api_key === 'string' ? rawCredentials.ark_api_key : undefined,
      api_endpoint_host:
        typeof rawCredentials?.api_endpoint_host === 'string' ? rawCredentials.api_endpoint_host : undefined
    }
    return new SeedreamImageModelClient(new SeedreamArkClient(credentials))
  }
}

@Injectable()
export class VolcengineVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: VolcengineProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: VolcengineModelCredentials): Promise<void> {
    if (!credentials?.ark_api_key) throw new Error('Ark API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<Record<string, unknown>, SeedanceVideoTask> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('Volcengine model provider context is missing')
    const credentials = readCredentials(copilot.modelProvider?.credentials)
    return new SeedanceVideoModelClient(new SeedreamArkClient(credentials))
  }
}

function readCredentials(rawCredentials: ICopilotProvider['credentials']): VolcengineModelCredentials {
  return {
    ark_api_key: typeof rawCredentials?.ark_api_key === 'string' ? rawCredentials.ark_api_key : undefined,
    api_endpoint_host:
      typeof rawCredentials?.api_endpoint_host === 'string' ? rawCredentials.api_endpoint_host : undefined
  }
}
