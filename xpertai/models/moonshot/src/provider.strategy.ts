import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import {
  getMoonshotBaseUrl,
  Moonshot,
  MoonshotCredentials,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(Moonshot)
export class MoonshotProviderStrategy extends ModelProvider {
  override logger = new Logger(MoonshotProviderStrategy.name);

  getBaseUrl(credentials: MoonshotCredentials): string {
    return getMoonshotBaseUrl(credentials);
  }

  getAuthorization(credentials: MoonshotCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(
    credentials: MoonshotCredentials
  ): Promise<void> {
    try {
      const baseUrl = this.getBaseUrl(credentials).replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/models`, {
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
            `Moonshot credentials verification failed with status ${response.status}`
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
