import { Injectable, Logger } from '@nestjs/common';
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk';
import { AiModelTypeEnum } from '@metad/contracts';
import {
  DeepSeek,
  DeepseekCredentials,
  toCredentialKwargs,
} from './types.js';

@Injectable()
@AIModelProviderStrategy(DeepSeek)
export class DeepSeekProviderStrategy extends ModelProvider {
  override logger = new Logger(DeepSeekProviderStrategy.name);

  getBaseUrl(credentials: DeepseekCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL
	}

	getAuthorization(credentials: DeepseekCredentials): string {
		return `Bearer ${credentials.api_key}`
	}

	async validateProviderCredentials(credentials: DeepseekCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('deepseek-chat', credentials)
		} catch (ex: any) {
			if (ex instanceof CredentialsValidateFailedError) {
				throw ex
			} else {
				this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
				throw ex
			}
		}
	}
}
