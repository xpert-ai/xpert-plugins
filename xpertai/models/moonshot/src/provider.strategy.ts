import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import { AiModelTypeEnum } from '@metad/contracts';
import {
  Moonshot,
  MoonshotBaseUrl,
  MoonshotCredentials,
  toCredentialKwargs,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(Moonshot)
export class MoonshotProviderStrategy extends ModelProvider {
  override logger = new Logger(MoonshotProviderStrategy.name);

  getBaseUrl(credentials: MoonshotCredentials): string {
    return credentials.base_url || MoonshotBaseUrl;
  }

  getAuthorization(credentials: MoonshotCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: MoonshotCredentials
  ): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM);
      // Use moonshot-v1-8k for validation (most cost-effective)
      await modelInstance.validateCredentials('moonshot-v1-8k', credentials);
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

