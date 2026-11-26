import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Hunyuan, HunyuanCredentials, HunyuanTokenHubBaseUrl, getBaseUrlFromCredentials } from './types.js'

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
      if (credentials.endpoint_url || credentials.endpoint_model_name) {
        const isTokenHub = credentials.endpoint_url &&
          new URL(credentials.endpoint_url).hostname === new URL(HunyuanTokenHubBaseUrl).hostname
        const probe = credentials.endpoint_model_name || (isTokenHub ? 'hy4-flash' : 'hunyuan-turbos-latest')
        await modelInstance.validateCredentials(probe, credentials)
        return
      }
      try {
        await modelInstance.validateCredentials('hunyuan-turbos-latest', credentials)
      } catch (legacyError) {
        // TokenHub-issued credentials can be restricted to its Guangzhou site.
        const response = await fetch(getBaseUrlFromCredentials(credentials, 'hy4') + '/models', {
          headers: { Authorization: this.getAuthorization(credentials) },
          signal: AbortSignal.timeout(10000)
        })
        if (!response.ok) throw legacyError
        const body: unknown = await response.json()
        if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) throw legacyError
      }
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
