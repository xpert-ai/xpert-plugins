import { AiModelTypeEnum } from '@xpert-ai/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import {
  Mimo,
  type MimoCredentials,
  getMimoBaseUrl,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(Mimo)
export class MimoProviderStrategy extends ModelProvider {
  override logger = new Logger(MimoProviderStrategy.name);

  getBaseUrl(credentials: MimoCredentials): string {
    return getMimoBaseUrl(credentials);
  }

  getAuthorization(credentials: MimoCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: MimoCredentials
  ): Promise<void> {
    try {
      await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials(
        'mimo-v2.5',
        credentials
      );
    } catch (error) {
      if (error instanceof CredentialsValidateFailedError) {
        throw error;
      }
      this.logger.error(
        `${this.getProviderSchema().provider}: credentials verification failed`,
        error instanceof Error ? error.stack : error
      );
      throw error;
    }
  }
}
