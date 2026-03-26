import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@metad/contracts'
import { Hunyuan, HunyuanCredentials, getBaseUrlFromCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Hunyuan)
export class HunyuanProviderStrategy extends ModelProvider {
  override logger = new Logger(HunyuanProviderStrategy.name)

  getBaseUrl(credentials: HunyuanCredentials): string {
    return getBaseUrlFromCredentials(credentials)
  }

  getAuthorization(credentials: HunyuanCredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  override async validateProviderCredentials(credentials: HunyuanCredentials): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
      await modelInstance.validateCredentials('hunyuan-turbos-latest', credentials)
    } catch (ex: unknown) {
      if (ex instanceof CredentialsValidateFailedError) {
        throw ex
      }

      if (ex instanceof Error) {
        this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
      } else {
        this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex)
      }
      throw ex
    }
  }
}
