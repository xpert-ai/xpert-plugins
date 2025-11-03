import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { OpenAICompatible, OpenAICompatModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(OpenAICompatible)
export class OpenAICompatibleProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenAICompatibleProviderStrategy.name)

  override async validateProviderCredentials(credentials: OpenAICompatModelCredentials): Promise<void> {
    //
  }

  getBaseUrl(credentials: OpenAICompatModelCredentials): string {
    return credentials.endpoint_url || 'https://api.openai.com/v1'
  }

  getAuthorization(credentials: OpenAICompatModelCredentials): string {
    return `Bearer ${credentials.api_key}`
  }
}
