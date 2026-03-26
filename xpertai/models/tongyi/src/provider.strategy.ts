import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { getBaseUrlFromCredentials, Tongyi, TongyiCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Tongyi)
export class TongyiProviderStrategy extends ModelProvider {
  override logger = new Logger(TongyiProviderStrategy.name)

  override async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      await modelInstance.validateCredentials('qwen-flash', credentials)
    } catch (error) {
      if (error instanceof CredentialsValidateFailedError) {
        throw error
      }
      this.logger.error('Tongyi credentials verification failed', error)
      throw error
    }
  }

  getBaseUrl(credentials: TongyiCredentials): string {
    return getBaseUrlFromCredentials(credentials)
  }

  getAuthorization(credentials: TongyiCredentials): string {
    return `Bearer ${credentials.dashscope_api_key}`
  }
}
