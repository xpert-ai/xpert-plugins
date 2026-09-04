import { randomUUID } from 'node:crypto'
import {
  AiModelTypeEnum,
  type ICopilotModel,
  type ImageGenerationOperation,
  type ModelUsageReport
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type AIGCModelClient,
  type AIGCModelResult,
  ImageGenerationModel,
  type TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import {
  getXirangBaseUrl,
  getXirangAuthorization,
  resolveXirangEndpointModel,
  type XirangImageInput,
  type XirangImageResponse,
  type XirangModelCredentials,
  type XirangPredefinedModelConfig
} from '../types.js'
import { getXirangImagePricingDimensions } from './pricing.js'

class XirangImageClient implements AIGCModelClient<XirangImageInput, XirangImageResponse> {
  constructor(
    private readonly credentials: XirangModelCredentials,
    private readonly model: string,
    private readonly endpointModel: string,
    private readonly handleModelUsage?: (report: ModelUsageReport) => void | Promise<void>,
    private readonly resolveUsagePricingSnapshot?: NonNullable<TChatModelOptions['resolveUsagePricingSnapshot']>
  ) {}

  async invoke(input: XirangImageInput): Promise<AIGCModelResult<XirangImageResponse>> {
    if (countInputImages(input) > 0) {
      throw new Error('天翼云图片编辑接口尚未验证，当前仅支持文生图')
    }
    const startedAt = new Date().toISOString()
    const response = await fetch(`${getXirangBaseUrl(this.credentials)}/images/generations`, {
      method: 'POST',
      headers: { Authorization: getXirangAuthorization(this.credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        model: this.endpointModel,
        response_format: input.response_format || 'url'
      })
    })
    if (!response.ok) throw new Error(`Xirang image endpoint returned HTTP ${response.status}`)
    const data = (await response.json()) as XirangImageResponse
    const operation: ImageGenerationOperation = 'text_to_image'
    const pricingDimensions = getXirangImagePricingDimensions(this.model, input, data)
    const outputQuantity = Array.isArray(data.data) && data.data.length > 0 ? data.data.length : 1
    const metrics = [
      {
        unit: 'generation' as const,
        quantity: outputQuantity,
        authority: 'provider' as const,
        component: 'output' as const,
        pricingDimensions
      }
    ]
    if (this.handleModelUsage) {
      const recordedAt = new Date().toISOString()
      const pricingSnapshot = this.resolveUsagePricingSnapshot
        ? await this.resolveUsagePricingSnapshot({
            model: this.model,
            operation,
            modality: 'image',
            pricingDimensions,
            startedAt
          })
        : undefined
      await this.handleModelUsage({
        requestId: randomUUID(),
        model: this.model,
        modelType: AiModelTypeEnum.IMAGE,
        operation,
        modality: 'image',
        pricingDimensions,
        ...(pricingSnapshot ? { pricingSnapshot } : {}),
        metrics,
        recordedAt
      })
    }
    return {
      data,
      observation: {
        state: 'succeeded',
        metrics
      }
    }
  }
}

function countInputImages(input: XirangImageInput): number {
  const images = input.images
  if (Array.isArray(images)) return images.length
  if (typeof images === 'string' && images.trim()) return 1
  if (Array.isArray(input.image)) return input.image.length
  if (typeof input.image === 'string' && input.image.trim()) return 1
  if (typeof input.image_url === 'string' && input.image_url.trim()) return 1
  return 0
}

@Injectable()
export class XirangImageGenerationModel extends ImageGenerationModel {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.IMAGE)
  }

  override async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) throw new Error('天翼云 AppKey 不能为空')
    if (!model?.trim()) throw new Error('图片模型名称不能为空')
  }

  override getAIGCModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ): AIGCModelClient<XirangImageInput, XirangImageResponse> {
    const credentials = {
      ...(copilotModel.copilot?.modelProvider?.credentials ?? {}),
      ...(options?.modelProperties ?? {})
    } as XirangModelCredentials
    const modelConfig = this.getModelSchema(copilotModel.model)?.modelConfig as XirangPredefinedModelConfig | undefined
    const endpointModel = resolveXirangEndpointModel(credentials, copilotModel.model, modelConfig)
    if (!endpointModel) throw new Error('天翼云图片模型名称不能为空')
    return new XirangImageClient(
      credentials,
      copilotModel.model,
      endpointModel,
      options?.handleModelUsage,
      options?.resolveUsagePricingSnapshot
    )
  }
}
