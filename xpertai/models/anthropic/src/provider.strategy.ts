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
    if (!credentials.anthropic_api_key) {
      throw new Error('Anthropic API key is required')
    }

    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      // Use a cost-effective model for validation
      await modelInstance.validateCredentials('claude-haiku-4-5', credentials)
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

  getBaseUrl(credentials: AnthropicCredentials): string {
    // Support custom base URL or use official API endpoint
    return credentials.anthropic_api_url?.replace(/\/$/, '') || 'https://api.anthropic.com'
  }

  getAuthorization(credentials: AnthropicCredentials): string {
    // Anthropic API uses x-api-key header, not Bearer token
    return credentials.anthropic_api_key
  }
}
