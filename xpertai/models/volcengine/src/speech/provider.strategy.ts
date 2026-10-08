import { Injectable } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

export const speechCredentialsSchema = z.object({ speech_api_key: z.string().min(1) })

@Injectable()
@AIModelProviderStrategy('volcengine-speech')
export class VolcengineSpeechProvider extends ModelProvider {
  override async validateProviderCredentials(credentials: unknown) {
    if (!speechCredentialsSchema.safeParse(credentials).success) throw new Error('Speech API key is required')
  }
  override getBaseUrl() { return 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue' }
  override getAuthorization(credentials: unknown) {
    const parsed = speechCredentialsSchema.safeParse(credentials)
    if (!parsed.success) throw new Error('Speech API key is required')
    return parsed.data.speech_api_key
  }
}
