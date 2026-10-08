import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { AIModel, type RealtimeModelConnection } from '@xpert-ai/plugin-sdk'
import { VolcengineSpeechProvider, speechCredentialsSchema } from '../provider.strategy.js'
import { DoubaoRealtimeProtocol } from './protocol.js'

@Injectable()
export class DoubaoRealtimeModel extends AIModel {
  constructor(provider: VolcengineSpeechProvider) { super(provider, AiModelTypeEnum.REALTIME) }
  override async validateCredentials(model: string, credentials: unknown) {
    if (model !== '1.2.6.1' || !speechCredentialsSchema.safeParse(credentials).success)
      throw new Error('Invalid Doubao realtime model or Speech credentials')
  }
  override getRealtimeModel(model: ICopilotModel): RealtimeModelConnection {
    const parsed = speechCredentialsSchema.safeParse(model.copilot?.modelProvider?.credentials)
    if (!parsed.success || model.model !== '1.2.6.1')
      throw new Error('Invalid Doubao realtime model or Speech credentials')
    return {
      url: 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue',
      headers: { 'X-Api-Key': parsed.data.speech_api_key },
      createProtocol: (options, sink) => new DoubaoRealtimeProtocol(options, sink)
    }
  }
}
