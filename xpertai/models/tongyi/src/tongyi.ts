
import { Injectable, Module } from '@nestjs/common'
import { AiModelTypeEnum } from '@metad/contracts'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs, TongyiCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy('tongyi')
export class TongyiProviderStrategy extends ModelProvider {

	getBaseUrl(credentials: TongyiCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL
	}

	getAuthorization(credentials: TongyiCredentials): string {
		return `Bearer ${credentials.dashscope_api_key}`
	}

	async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('qwen-turbo', credentials)
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
