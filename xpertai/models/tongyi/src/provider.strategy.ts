import { Injectable, Logger } from '@nestjs/common'
import { ModelProvider, 
    AIModelProviderStrategy, 
    CredentialsValidateFailedError 
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@metad/contracts'
import { TongyiCredentials, toCredentialKwargs } from './types.js'
import { Tongyi } from './types.js'

@Injectable()
@AIModelProviderStrategy(Tongyi)
export class TongyiProviderStrategy extends ModelProvider {
	override logger = new Logger(TongyiProviderStrategy.name)
	getBaseUrl(credentials: TongyiCredentials): string {
		const params = toCredentialKwargs(credentials)
		return params.configuration.baseURL??'https://dashscope.aliyuncs.com/compatible-mode/v1'
	}

	getAuthorization(credentials: TongyiCredentials): string {
		return `Bearer ${credentials.dashscope_api_key}`
	}

	async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
		try {
			const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)

			await modelInstance.validateCredentials('qwen-turbo', credentials)
		} catch (ex) {
			if (ex instanceof CredentialsValidateFailedError) {
				throw ex
			} else {
				this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
				throw ex
			}
		}
	}
}