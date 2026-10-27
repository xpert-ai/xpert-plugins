import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider, type NativeModelClientFactory, LargeLanguageModel } from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { compatibleResponsesTransport } from './native.js'
import { OpenAICompatible, OpenAICompatModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(OpenAICompatible)
export class OpenAICompatibleProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenAICompatibleProviderStrategy.name)

  readonly getNativeModelClient: NativeModelClientFactory = async (
    protocol, model, options?: { modelProperties?: Record<string, unknown> }
  ) => {
    if (protocol !== 'openai_responses') throw new Error('Native model protocol is unavailable')
    const generate = compatibleResponsesTransport(options?.modelProperties)
    const manager = this.getModelManager<LargeLanguageModel>(AiModelTypeEnum.LLM)
    return { protocol, generate, priceUsage: (usage, context) => manager.priceActualTokenUsage(model.model, usage, context) }
  }

  override async validateProviderCredentials(credentials: OpenAICompatModelCredentials): Promise<void> {
    //
  }

  getBaseUrl(credentials: OpenAICompatModelCredentials): string {
    return credentials.endpoint_url || 'https://api.openai.com/v1'
  }

  getAuthorization(credentials: OpenAICompatModelCredentials): string {
    return `Bearer ${credentials.api_key}`
  }
}
