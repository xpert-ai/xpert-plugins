import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { RerankModel, type AIGCModelClient, type AIGCModelResult, type IRerank, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { getXirangBaseUrl, type XirangImageInput, type XirangImageResponse, type XirangModelCredentials } from '../types.js'

class XirangImageClient implements AIGCModelClient<XirangImageInput, XirangImageResponse> {
  constructor(private readonly credentials: XirangModelCredentials, private readonly model: string) {}

  async invoke(input: XirangImageInput): Promise<AIGCModelResult<XirangImageResponse>> {
    const response = await fetch(`${getXirangBaseUrl(this.credentials)}/images/generations`, {
      method: 'POST',
      headers: { Authorization: this.credentials.app_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        model: this.credentials.endpoint_model_name || this.model,
        response_format: input.response_format || 'url',
        stream: false,
        watermark: input.watermark ?? true
      })
    })
    if (!response.ok) throw new Error(`Xirang image endpoint returned HTTP ${response.status}`)
    const data = (await response.json()) as XirangImageResponse
    return {
      data,
      observation: {
        state: 'succeeded',
        metrics: [{ unit: 'generation', quantity: Array.isArray(data.data) && data.data.length > 0 ? data.data.length : 1, authority: 'provider', component: 'output' }]
      }
    }
  }
}

@Injectable()
// The host's 3.16 runtime does not export ImageGenerationModel yet. RerankModel
// shares the AIModel registration/runtime base, so it is a compatible fallback
// until the host SDK exposes the dedicated image manager class.
export class XirangImageGenerationModel extends RerankModel {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.IMAGE)
  }

  override async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) throw new Error('天翼云 AppKey 不能为空')
    if (!model?.trim()) throw new Error('图片模型名称不能为空')
  }

  override async getReranker(): Promise<IRerank> {
    throw new Error('天翼云图片模型不支持重排')
  }

  override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions): AIGCModelClient<XirangImageInput, XirangImageResponse> {
    const credentials = {
      ...(copilotModel.copilot?.modelProvider?.credentials ?? {}),
      ...(options?.modelProperties ?? {})
    } as XirangModelCredentials
    return new XirangImageClient(credentials, copilotModel.model)
  }
}
