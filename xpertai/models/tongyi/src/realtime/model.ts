import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { AIModel, type RealtimeModelConnection } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { getTongyiRealtimeUrl, isTongyiWorkspaceApiHost } from '../types.js'
import { QwenRealtimeProtocol } from './protocol.js'

const credentialsSchema = z.object({
  dashscope_api_key: z.string().min(1),
  api_host: z.string().refine(isTongyiWorkspaceApiHost)
})

@Injectable()
export class TongyiRealtimeModel extends AIModel {
  constructor(provider: TongyiProviderStrategy) { super(provider, AiModelTypeEnum.REALTIME) }
  override async validateCredentials(model: string, credentials: unknown) {
    if (model !== 'qwen3.8-omni-flash-realtime' || !credentialsSchema.safeParse(credentials).success)
      throw new Error('Invalid Qwen realtime model, API key or workspace api_host')
  }
  override getRealtimeModel(model: ICopilotModel): RealtimeModelConnection {
    const parsed = credentialsSchema.safeParse(model.copilot?.modelProvider?.credentials)
    if (!parsed.success || model.model !== 'qwen3.8-omni-flash-realtime')
      throw new Error('Invalid Qwen realtime model, API key or workspace api_host')
    const credentials = parsed.data
    return {
      url: getTongyiRealtimeUrl(credentials, model.model),
      headers: { Authorization: `Bearer ${credentials.dashscope_api_key}` },
      createProtocol: (options, sink) => new QwenRealtimeProtocol(options, sink)
    }
  }
}
