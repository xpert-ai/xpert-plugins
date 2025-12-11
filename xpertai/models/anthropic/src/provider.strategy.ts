import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { Anthropic, AnthropicModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Anthropic)
export class AnthropicProviderStrategy extends ModelProvider {
  override logger = new Logger(AnthropicProviderStrategy.name)

  override async validateProviderCredentials(
    credentials: AnthropicModelCredentials
  ): Promise<void> {
    if (!credentials.api_key) {
      throw new Error('Anthropic API key is required')
    }
    // Additional validation can be added here if needed
  }
}

