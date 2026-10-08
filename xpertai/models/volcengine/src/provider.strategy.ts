import { Injectable, Logger } from '@nestjs/common'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk'
import { Volcengine, VolcengineBaseUrl, VolcengineModelCredentials } from './types.js'

@Injectable()
@AIModelProviderStrategy(Volcengine)
export class VolcengineProviderStrategy extends ModelProvider {
  override logger = new Logger(VolcengineProviderStrategy.name)

  override async validateProviderCredentials(credentials: VolcengineModelCredentials): Promise<void> {
    if (!credentials.ark_api_key?.trim()) {
      throw new CredentialsValidateFailedError('Ark API key is missing')
    }
    await this.getModelManager(AiModelTypeEnum.LLM).validateCredentials(
      'doubao-seed-2-0-mini-260215',
      credentials
    )
  }

  getBaseUrl(credentials: VolcengineModelCredentials): string {
    return credentials?.api_endpoint_host || VolcengineBaseUrl
  }

  getAuthorization(credentials: VolcengineModelCredentials): string {
    return `Bearer ${credentials.ark_api_key}`
  }
}
