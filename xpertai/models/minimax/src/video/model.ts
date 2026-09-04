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
import { MiniMaxProviderStrategy } from '../provider.strategy.js'
import type { MiniMaxCredentials } from '../types.js'
import { MiniMaxVideoClient } from './client.js'
import type { MiniMaxVideoGenerationPayload, MiniMaxVideoTask } from './types.js'
import { normalizeMiniMaxVideoObservation } from './usage.js'

export class MiniMaxVideoModelClient
  implements AsyncAIGCModelClient<MiniMaxVideoGenerationPayload, MiniMaxVideoTask>
{
  constructor(private readonly client: MiniMaxVideoClient) {}

  async submit(input: MiniMaxVideoGenerationPayload): Promise<AsyncAIGCModelSubmission<MiniMaxVideoTask>> {
    const task = await this.client.submitVideo(input)
    return { providerRequestId: task.id, data: task }
  }

  async query(
    providerRequestId: string,
    context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<MiniMaxVideoTask>> {
    void context
    const task = await this.client.queryVideo(providerRequestId)
    return { data: task, observation: normalizeMiniMaxVideoObservation(task) }
  }
}

@Injectable()
export class MiniMaxVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: MiniMaxCredentials): Promise<void> {
    if (!credentials?.api_key) throw new Error('MiniMax API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ): AsyncAIGCModelClient<MiniMaxVideoGenerationPayload, MiniMaxVideoTask> {
    void options
    if (!copilotModel.copilot) throw new Error('MiniMax model provider context is missing')
    return new MiniMaxVideoModelClient(
      new MiniMaxVideoClient(readCredentials(copilotModel.copilot.modelProvider?.credentials))
    )
  }
}

function readCredentials(credentials: ICopilotProvider['credentials']): MiniMaxCredentials {
  return {
    api_key: typeof credentials?.api_key === 'string' ? credentials.api_key : '',
    group_id: typeof credentials?.group_id === 'string' ? credentials.group_id : '',
    base_url: typeof credentials?.base_url === 'string' ? credentials.base_url : undefined
  }
}
