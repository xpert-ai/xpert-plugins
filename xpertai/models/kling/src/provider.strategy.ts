import { Injectable } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider
} from '@xpert-ai/plugin-sdk'
import { KlingDefaultBaseUrl, KlingModelProvider, type KlingCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(KlingModelProvider)
export class KlingProviderStrategy extends ModelProvider {
  getBaseUrl(credentials: KlingCredentials): string {
    return (credentials.api_endpoint_host || KlingDefaultBaseUrl).replace(/\/$/, '')
  }

  getAuthorization(credentials: KlingCredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  async validateProviderCredentials(credentials: KlingCredentials): Promise<void> {
    if (!credentials.api_key?.trim()) {
      throw new CredentialsValidateFailedError('Kling API key is missing')
    }
    try {
      const endpoint = new URL(this.getBaseUrl(credentials))
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
        throw new Error('invalid endpoint')
      }
    } catch {
      throw new CredentialsValidateFailedError('Kling API endpoint must use HTTPS')
    }
  }
}
