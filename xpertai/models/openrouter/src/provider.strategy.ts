import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import { AiModelTypeEnum } from '@metad/contracts';
import { OpenAICompatModelCredentials, toCredentialKwargs } from './types.js';

export const OpenRouter = 'openrouter';

@Injectable()
@AIModelProviderStrategy(OpenRouter)
export class OpenRouterProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenRouterProviderStrategy.name);

  getBaseUrl(credentials: OpenAICompatModelCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return kwags.configuration.baseURL || 'https://openrouter.ai/api/v1';
  }

  getAuthorization(credentials: OpenAICompatModelCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return `Bearer ${kwags.apiKey}`;
  }

  async validateProviderCredentials(
    credentials: OpenAICompatModelCredentials
  ): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM);
      // Use a cheap/free model for validation if possible, or a common one
      await modelInstance.validateCredentials(
        'google/gemma-2-9b-it:free',
        credentials
      );
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
