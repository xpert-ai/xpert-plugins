import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@metad/contracts'
import { Anthropic, AnthropicCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Anthropic)
export class AnthropicProviderStrategy extends ModelProvider {
  override logger = new Logger(AnthropicProviderStrategy.name)

  override async validateProviderCredentials(
    credentials: AnthropicCredentials
  ): Promise<void> {
    if (!credentials.api_key) {
      throw new Error('Anthropic API key is required')
    }

    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      // Use a cost-effective model for validation
      await modelInstance.validateCredentials('claude-3-haiku-20240307', credentials)
    } catch (ex: unknown) {
      if (ex instanceof CredentialsValidateFailedError) {
        throw ex
      } else if (ex instanceof Error) {
        this.logger.error(
          `${this.getProviderSchema().provider}: credentials verification failed`,
          ex.stack
        )
        throw ex
      } else {
        this.logger.error(
          `${this.getProviderSchema().provider}: credentials verification failed`,
          ex
        )
        throw ex
      }
    }
  }
}

