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
import { GeminiVeoClient, validateVeoOperationName } from './client.js'
import { VeoProviderStrategy } from './provider.strategy.js'
import type { VeoCredentials, VeoGenerationRequest, VeoOperation } from './types.js'
import { normalizeVeoObservation } from './usage.js'

export class VeoVideoModelClient
  implements AsyncAIGCModelClient<VeoGenerationRequest, VeoOperation>
{
  constructor(private readonly client: GeminiVeoClient) {}

  async submit(input: VeoGenerationRequest): Promise<AsyncAIGCModelSubmission<VeoOperation>> {
    const operation = await this.client.submit(input.model, input.payload)
    const operationName = operation.name?.trim()
    if (!operationName) throw new Error('Gemini Veo response did not include an operation name')
    const providerRequestId = validateVeoOperationName(operationName)
    return { providerRequestId, data: operation }
  }

  async query(
    providerRequestId: string,
    context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<VeoOperation>> {
    const operation = await this.client.getOperation(providerRequestId)
    return {
      data: operation,
      observation: normalizeVeoObservation(operation, context?.pricingDimensions)
    }
  }
}

@Injectable()
export class VeoVideoGenerationModel extends VideoGenerationModel {
  constructor(modelProvider: VeoProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(_model: string, credentials: VeoCredentials): Promise<void> {
    if (!credentials?.gemini_api_key) throw new Error('Gemini API key is missing')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<VeoGenerationRequest, VeoOperation> {
    const copilot = copilotModel.copilot
    if (!copilot) throw new Error('Google Veo model provider context is missing')
    return new VeoVideoModelClient(new GeminiVeoClient(readCredentials(copilot.modelProvider?.credentials)))
  }
}

function readCredentials(credentials: ICopilotProvider['credentials']): VeoCredentials {
  return {
    gemini_api_key:
      typeof credentials?.gemini_api_key === 'string' ? credentials.gemini_api_key : undefined
  }
}
