import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { Volcengine, VolcengineBaseUrl, VolcengineModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Volcengine)
export class VolcengineProviderStrategy extends ModelProvider {
  override logger = new Logger(VolcengineProviderStrategy.name)

  override async validateProviderCredentials(credentials: VolcengineModelCredentials): Promise<void> {
    if (!credentials.ark_api_key) {
      throw new Error('Ark API key is missing')
    }
  }

  getBaseUrl(credentials: VolcengineModelCredentials): string {
    return credentials?.api_endpoint_host || VolcengineBaseUrl
  }

  getAuthorization(credentials: VolcengineModelCredentials): string {
    return `Bearer ${credentials.ark_api_key}`
  }
}
