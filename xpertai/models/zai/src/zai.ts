import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '@xpert-ai/plugin-sdk'
import { ZAICredentials, ZAIModelProvider } from './types.js'
import { Logger } from '@nestjs/common'
import { AIModelProviderStrategy, CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs } from './types.js'

@Injectable()
@AIModelProviderStrategy(ZAIModelProvider)
export class ZAIProviderStrategy extends ModelProvider {
  override logger = new Logger(ZAIProviderStrategy.name)

  getBaseUrl(credentials: ZAICredentials): string {
    const params = toCredentialKwargs(credentials)
    return params.configuration.baseURL
  }

  getAuthorization(credentials: ZAICredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  async validateProviderCredentials(credentials: ZAICredentials): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      await modelInstance.validateCredentials('glm-4.7-flash', credentials)
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
