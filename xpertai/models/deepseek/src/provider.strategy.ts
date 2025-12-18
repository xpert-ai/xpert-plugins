import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import { AiModelTypeEnum } from '@metad/contracts';
import {
  DeepSeek,
  DeepSeekBaseUrl,
  DeepSeekCredentials,
  toCredentialKwargs,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(DeepSeek)
export class DeepSeekProviderStrategy extends ModelProvider {
  override logger = new Logger(DeepSeekProviderStrategy.name);

  getBaseUrl(credentials: DeepSeekCredentials): string {
    return credentials.base_url || DeepSeekBaseUrl;
  }

  getAuthorization(credentials: DeepSeekCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: DeepSeekCredentials
  ): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM);
      // Use deepseek-chat for validation
      await modelInstance.validateCredentials('deepseek-chat', credentials);
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
