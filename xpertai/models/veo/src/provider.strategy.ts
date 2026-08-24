import { Injectable } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider
} from '@xpert-ai/plugin-sdk'
import { VeoApiBaseUrl, VeoModelProvider, type VeoCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(VeoModelProvider)
export class VeoProviderStrategy extends ModelProvider {
  getBaseUrl(): string {
    return VeoApiBaseUrl
  }

  getAuthorization(credentials: VeoCredentials): string {
    return `ApiKey ${credentials.gemini_api_key}`
  }

  async validateProviderCredentials(credentials: VeoCredentials): Promise<void> {
    if (!credentials.gemini_api_key?.trim()) {
      throw new CredentialsValidateFailedError('Gemini API key is missing')
    }
  }
}
