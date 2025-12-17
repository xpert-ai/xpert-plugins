import { Injectable } from '@nestjs/common';
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk';
import { MiniMax, MiniMaxCredentials } from './types.js';

@Injectable()
@AIModelProviderStrategy(MiniMax)
export class MiniMaxProviderStrategy extends ModelProvider {
  getBaseUrl(credentials: MiniMaxCredentials): string {
    const baseURL = credentials.base_url || 'https://api.minimaxi.com';
    return baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  }

  getAuthorization(credentials: MiniMaxCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(credentials: MiniMaxCredentials): Promise<void> {
    if (!credentials.api_key || typeof credentials.api_key !== 'string') {
      throw new CredentialsValidateFailedError('API key is required and must be a string');
    }

    if (!credentials.group_id || typeof credentials.group_id !== 'string') {
      throw new CredentialsValidateFailedError('Group ID is required and must be a string');
    }

    if (credentials.base_url) {
      try {
        new URL(credentials.base_url);
      } catch {
        throw new CredentialsValidateFailedError('Invalid base URL format');
      }
    }
  }
}