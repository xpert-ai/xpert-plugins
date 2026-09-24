import { Injectable } from '@nestjs/common';
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk';
import { MiniMax, MiniMaxCredentials, toCredentialKwargs } from './types.js';

@Injectable()
@AIModelProviderStrategy(MiniMax)
export class MiniMaxProviderStrategy extends ModelProvider {
  getBaseUrl(credentials: MiniMaxCredentials): string {
    return toCredentialKwargs(credentials).configuration.baseURL;
  }

  getAuthorization(credentials: MiniMaxCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(credentials: MiniMaxCredentials): Promise<void> {
    if (typeof credentials.api_key !== 'string' || !credentials.api_key.trim()) {
      throw new CredentialsValidateFailedError('API key is required and must be a string');
    }

    if (typeof credentials.group_id !== 'string' || !credentials.group_id.trim()) {
      throw new CredentialsValidateFailedError('Group ID is required and must be a string');
    }

    if (credentials.base_url) {
      try {
        new URL(credentials.base_url);
      } catch {
        throw new CredentialsValidateFailedError('Invalid base URL format');
      }
    }

    try {
      // The authenticated model list validates the key without running inference.
      const response = await fetch(`${this.getBaseUrl(credentials)}/models`, {
        headers: { Authorization: this.getAuthorization(credentials) },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        throw new CredentialsValidateFailedError(
          `MiniMax credentials verification failed with status ${response.status}`
        );
      }
      const body: unknown = await response.json();
      // Do not accept a successful HTTP status with an API error or proxy HTML.
      if (
        !body ||
        typeof body !== 'object' ||
        ('error' in body && body.error) ||
        ('base_resp' in body &&
          body.base_resp &&
          typeof body.base_resp === 'object' &&
          'status_code' in body.base_resp &&
          body.base_resp.status_code !== 0) ||
        !('data' in body) ||
        !Array.isArray(body.data)
      ) {
        throw new CredentialsValidateFailedError('MiniMax returned an invalid model list during credential verification');
      }
    } catch (error) {
      if (error instanceof CredentialsValidateFailedError) {
        throw error;
      }
      throw new CredentialsValidateFailedError('MiniMax credentials verification failed: unable to retrieve models');
    }
  }
}
