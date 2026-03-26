import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import {
  getBaseUrlFromCredentials,
  Siliconflow,
  SiliconflowCredentials,
  SiliconflowModelCredentials,
} from './types.js'

@Injectable()
@AIModelProviderStrategy(Siliconflow)
export class SiliconflowProviderStrategy extends ModelProvider {
  override logger = new Logger(SiliconflowProviderStrategy.name)

  override async validateProviderCredentials(credentials: SiliconflowCredentials): Promise<void> {
    const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
    await modelInstance.validateCredentials(
      'deepseek-ai/DeepSeek-V3',
      credentials as SiliconflowModelCredentials
    )
  }

  getBaseUrl(credentials: SiliconflowCredentials): string {
    return getBaseUrlFromCredentials(credentials)
  }

  getAuthorization(credentials: SiliconflowCredentials): string {
    return `Bearer ${credentials.api_key}`
  }
}
