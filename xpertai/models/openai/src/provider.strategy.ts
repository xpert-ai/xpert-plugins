import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@metad/contracts'
import {
  OpenAIProvider,
  OpenAICredentials,
  toCredentialKwargs,
} from './types.js'

@Injectable()
@AIModelProviderStrategy(OpenAIProvider)
export class OpenAIProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenAIProviderStrategy.name)

  getBaseUrl(credentials: OpenAICredentials): string {
    const params = toCredentialKwargs(credentials)
    return params.configuration.baseURL
  }

  getAuthorization(credentials: OpenAICredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  async validateProviderCredentials(credentials: OpenAICredentials): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      await modelInstance.validateCredentials('gpt-5', credentials)
    } catch (ex: any) {
      if (ex instanceof CredentialsValidateFailedError) {
        throw ex
      } else {
        this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
        throw ex
      }
    }
  }
}
