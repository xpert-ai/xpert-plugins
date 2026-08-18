import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import {
  OpenRouterAiBaseUrl,
  OpenRouterModelCredentials,
  toCredentialKwargs,
} from './types.js';

export const OpenRouter = 'openrouter';

@Injectable()
@AIModelProviderStrategy(OpenRouter)
export class OpenRouterProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenRouterProviderStrategy.name);

  getBaseUrl(credentials: OpenRouterModelCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return kwags.configuration.baseURL || OpenRouterAiBaseUrl;
  }

  getAuthorization(credentials: OpenRouterModelCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return `Bearer ${kwags.apiKey}`;
  }

  async validateProviderCredentials(
    credentials: OpenRouterModelCredentials
  ): Promise<void> {
    try {
      const baseUrl = this.getBaseUrl(credentials).replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/key`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: this.getAuthorization(credentials),
        },
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new CredentialsValidateFailedError(
          errorMessage ||
            `OpenRouter credentials verification failed with status ${response.status}`
        );
      }
    } catch (ex: unknown) {
      if (ex instanceof CredentialsValidateFailedError) {
        throw ex;
      } else if (ex instanceof Error) {
        this.logger.error(
          `${
            this.getProviderSchema().provider
          }: credentials verification failed`,
          ex.stack
        );
        throw ex;
      } else {
        this.logger.error(
          `${
            this.getProviderSchema().provider
          }: credentials verification failed`,
          ex
        );
        throw ex;
      }
    }
  }
}
