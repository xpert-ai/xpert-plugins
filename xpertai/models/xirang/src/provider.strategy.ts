import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider, getErrorMessage, discoverOpenAIModels } from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum, type AIModelEntity, type DiscoveredModel } from '@xpert-ai/contracts'
import { getRerankRequest } from './rerank/protocol.js'
import { z } from 'zod'
import { Xirang, type XirangCredentials, getXirangAuthorization, getXirangBaseUrl, isOfficialXirangEndpoint } from './types.js'

@Injectable()
@AIModelProviderStrategy(Xirang)
export class XirangProviderStrategy extends ModelProvider {
  override logger = new Logger(XirangProviderStrategy.name)

  getBaseUrl(credentials: XirangCredentials): string {
    return getXirangBaseUrl(credentials)
  }

  getAuthorization(credentials: XirangCredentials): string {
    return getXirangAuthorization(credentials)
  }

  async discoverModels(credentials: XirangCredentials): Promise<DiscoveredModel[]> {
    const catalog: AIModelEntity[] = this.getSystemProviderModels(this.getProviderSchema().supported_model_types)
    const endpointIds = new Map(catalog.map((model) => [model.model,
      z.object({ endpoint_model_name: z.string().optional() }).parse(model.modelConfig ?? {}).endpoint_model_name
    ]))
    const predefinedModels = catalog.flatMap((model) => {
      const endpointId = endpointIds.get(model.model)
      return endpointId ? [model, { ...model, model: endpointId }] : [model]
    })
    const models = await discoverOpenAIModels({
      baseUrl: getXirangBaseUrl(credentials),
      authorization: getXirangAuthorization(credentials),
      predefinedModels
    })
    return models.map((model) => ({
      ...model,
      modelProperties: {
        endpoint_model_name: (isOfficialXirangEndpoint(credentials) ? endpointIds.get(model.model) : undefined) || model.model,
        ...(model.modelType === AiModelTypeEnum.RERANK
          ? { rerank_path: getRerankRequest(credentials, model.model).path }
          : {})
      }
    }))
  }

  override async validateProviderCredentials(credentials: XirangCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) {
      throw new CredentialsValidateFailedError('天翼云 AppKey 不能为空')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${getXirangBaseUrl(credentials)}/models`, {
        method: 'GET',
        headers: { Authorization: getXirangAuthorization(credentials), Accept: 'application/json' },
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(`Xirang model endpoint returned HTTP ${response.status}`)
      }
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    } finally {
      clearTimeout(timeout)
    }
  }
}
