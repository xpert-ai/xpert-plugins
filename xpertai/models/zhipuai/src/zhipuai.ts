import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '@xpert-ai/plugin-sdk'
import { ZhipuaiCredentials, ZhipuAIModelProvider } from './types.js'
import { Logger } from '@nestjs/common'
import { AIModelProviderStrategy, CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs } from './types.js'

@Injectable()
@AIModelProviderStrategy(ZhipuAIModelProvider)
export class ZhipuaiProviderStrategy extends ModelProvider {
  override logger = new Logger(ZhipuaiProviderStrategy.name)

  getBaseUrl(credentials: ZhipuaiCredentials): string {
    const params = toCredentialKwargs(credentials)
    return params.configuration.baseURL
  }

  getAuthorization(credentials: ZhipuaiCredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  async validateProviderCredentials(credentials: ZhipuaiCredentials): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      await modelInstance.validateCredentials('glm-4.7', credentials)
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
