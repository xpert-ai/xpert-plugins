import { Injectable, Logger } from '@nestjs/common'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk'
import { Volcengine, VolcengineBaseUrl, VolcengineModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Volcengine)
export class VolcengineProviderStrategy extends ModelProvider {
  override logger = new Logger(VolcengineProviderStrategy.name)
  // Ark's documented model-list APIs require AK/SK, not an Ark API key.
  readonly credentialValidation = { mode: 'model' as const, modelTypes: [AiModelTypeEnum.LLM] }

  override async validateProviderCredentials(credentials: VolcengineModelCredentials): Promise<void> {
    if (!credentials.ark_api_key?.trim()) {
      throw new CredentialsValidateFailedError('Ark API key is missing')
    }
    if (credentials.api_endpoint_host) {
      try {
        const url = new URL(credentials.api_endpoint_host)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
      } catch {
        throw new CredentialsValidateFailedError('Invalid Ark API endpoint URL')
      }
    }
    // The host validates the explicitly selected model with these credentials before saving.
  }

  getBaseUrl(credentials: VolcengineModelCredentials): string {
    return credentials?.api_endpoint_host || VolcengineBaseUrl
  }

  getAuthorization(credentials: VolcengineModelCredentials): string {
    return `Bearer ${credentials.ark_api_key}`
  }
}
