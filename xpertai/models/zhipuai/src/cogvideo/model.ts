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
import { ZhipuaiProviderStrategy } from '../zhipuai.js'
import { ZhipuCogVideoClient } from './client.js'
import type { ZhipuCogVideoCredentials, ZhipuVideoGenerationPayload, ZhipuVideoTask } from './types.js'
import { normalizeZhipuVideoObservation } from './usage.js'

export class ZhipuVideoModelClient
  implements AsyncAIGCModelClient<ZhipuVideoGenerationPayload, ZhipuVideoTask>
{
  constructor(private readonly client: ZhipuCogVideoClient) {}

  async submit(input: ZhipuVideoGenerationPayload): Promise<AsyncAIGCModelSubmission<ZhipuVideoTask>> {
    const task = await this.client.submitVideo(input)
    const providerRequestId = task.id?.trim()
    if (!providerRequestId) throw new Error('ZhipuAI did not return a video task ID')
    return { providerRequestId, data: task }
  }

  async query(
    providerRequestId: string,
    _context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<ZhipuVideoTask>> {
    const task = await this.client.getVideoTask(providerRequestId)
    return { data: task, observation: normalizeZhipuVideoObservation(task) }
  }
}

@Injectable()
export class ZhipuVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: ZhipuaiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: ZhipuCogVideoCredentials): Promise<void> {
    if (!credentials?.api_key) throw new Error('ZhipuAI API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<ZhipuVideoGenerationPayload, ZhipuVideoTask> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('ZhipuAI model provider context is missing')
    return new ZhipuVideoModelClient(
      new ZhipuCogVideoClient(readCredentials(copilot.modelProvider?.credentials))
    )
  }
}

function readCredentials(credentials: ICopilotProvider['credentials']): ZhipuCogVideoCredentials {
  return {
    api_key: typeof credentials?.api_key === 'string' ? credentials.api_key : undefined,
    endpoint_url: typeof credentials?.endpoint_url === 'string' ? credentials.endpoint_url : undefined
  }
}
