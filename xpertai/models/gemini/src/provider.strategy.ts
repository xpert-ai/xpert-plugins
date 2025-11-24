import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import { Gemini, GoogleCredentials, toCredentialKwargs } from './types.js';
import { AiModelTypeEnum } from '@metad/contracts';

@Injectable()
@AIModelProviderStrategy(Gemini)
export class GeminiProviderStrategy extends ModelProvider {
  override logger = new Logger(GeminiProviderStrategy.name);

  getBaseUrl(credentials: GoogleCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return kwags.baseUrl || `https://generativelanguage.googleapis.com`;
  }

  getAuthorization(credentials: GoogleCredentials): string {
    const kwags = toCredentialKwargs(credentials);
    return `Bearer ${kwags.apiKey}`;
  }

  async validateProviderCredentials(
    credentials: GoogleCredentials
  ): Promise<void> {
    try {
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM);

      await modelInstance.validateCredentials('gemini-2.5-flash', credentials);
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
      throw ex;
    }
  }
}
