import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk'
import { isTongyiWorkspaceApiHost, TongyiCredentials, TongyiModelProvider, toCredentialKwargs } from './types.js'

@Injectable()
@AIModelProviderStrategy(TongyiModelProvider)
export class TongyiProviderStrategy extends ModelProvider {
  override logger = new Logger(TongyiProviderStrategy.name)

  getBaseUrl(credentials: TongyiCredentials): string {
    const params = toCredentialKwargs(credentials)
    return params.configuration.baseURL
  }

  getAuthorization(credentials: TongyiCredentials): string {
    return `Bearer ${credentials.dashscope_api_key}`
  }

  async validateProviderCredentials(credentials: TongyiCredentials): Promise<void> {
    try {
      // Workspace endpoints have their own model catalog and may not grant access to qwen-turbo.
      // Authentication itself is checked by the realtime WebSocket handshake.
      if (isTongyiWorkspaceApiHost(credentials.api_host)) {
        await this.getModelManager(AiModelTypeEnum.REALTIME).validateCredentials('qwen3.8-omni-flash-realtime', credentials)
        return
      }
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
