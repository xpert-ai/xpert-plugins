import { AiModelTypeEnum } from '@xpert-ai/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import {
  Stepfun,
  StepfunBaseUrl,
  type StepfunCredentials,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(Stepfun)
export class StepfunProviderStrategy extends ModelProvider {
  override logger = new Logger(StepfunProviderStrategy.name);

  getBaseUrl(): string {
    return StepfunBaseUrl;
  }

  getAuthorization(credentials: StepfunCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: StepfunCredentials
  ): Promise<void> {
    try {
      await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials(
        'step-3.7-flash',
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
