import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Hunyuan, HunyuanCredentials, getBaseUrlFromCredentials } from './types.js'

const tokenHubHosts = new Set([
  'tokenhub.tencentmaas.com', 'tokenhub-intl.tencentmaas.com',
  'tokenhub.tencentmaas.cn', 'tokenhub-intl.tencentmaas.cn'
])

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
      const baseUrl = this.getBaseUrl(credentials)
      if (credentials.endpoint_model_name) {
        await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials(credentials.endpoint_model_name, credentials)
        return
      }
      const response = await fetch(baseUrl + '/models', {
        headers: { Authorization: this.getAuthorization(credentials) },
        signal: AbortSignal.timeout(10000)
      })
      if ([404, 405, 501].includes(response.status) && !tokenHubHosts.has(new URL(baseUrl).hostname)) {
        // Inference-only private gateways may still serve the historical validation model.
        await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials('hunyuan-turbos-latest', credentials)
        return
      }
      if (!response.ok) throw new CredentialsValidateFailedError(`TokenHub returned HTTP ${response.status}`)
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
        throw new CredentialsValidateFailedError('TokenHub returned an invalid model list')
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
