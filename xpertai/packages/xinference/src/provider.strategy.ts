import { Injectable, Logger } from '@nestjs/common';
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk';
import { Xinference, XinferenceModelCredentials } from './types.js';

@Injectable()
@AIModelProviderStrategy(Xinference)
export class XinferenceProviderStrategy extends ModelProvider {
  override logger = new Logger(XinferenceProviderStrategy.name);

  override async validateProviderCredentials(
    credentials: XinferenceModelCredentials
  ): Promise<void> {
    // No validation needed for vLLM
  }

  getBaseUrl(credentials: XinferenceModelCredentials): string {
    return credentials.server_url;
  }

  getAuthorization(credentials: XinferenceModelCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }
}
