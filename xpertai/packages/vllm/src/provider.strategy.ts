import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { VLLM, VLLMModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(VLLM)
export class VLLMProviderStrategy extends ModelProvider {
  override logger = new Logger(VLLMProviderStrategy.name)

  override async validateProviderCredentials(credentials: VLLMModelCredentials): Promise<void> {
    // No validation needed for vLLM
  }

  getBaseUrl(credentials: VLLMModelCredentials): string {
    return credentials.endpoint_url
  }

  getAuthorization(credentials: VLLMModelCredentials): string {
    return `Bearer ${credentials.api_key}`
  }
}
