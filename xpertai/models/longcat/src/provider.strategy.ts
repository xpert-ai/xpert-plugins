import { AiModelTypeEnum } from '@xpert-ai/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import {
  Longcat,
  type LongcatCredentials,
  getLongcatBaseUrl,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(Longcat)
export class LongcatProviderStrategy extends ModelProvider {
  override logger = new Logger(LongcatProviderStrategy.name);

  getBaseUrl(credentials: LongcatCredentials): string {
    return getLongcatBaseUrl(credentials);
  }

  getAuthorization(credentials: LongcatCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: LongcatCredentials
  ): Promise<void> {
    try {
      await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials(
        'LongCat-2.0',
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
