import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { WechatChatCallbackContext, WechatChatCallbackPayload } from './wechat-chat.types.js'

const DEFAULT_RUN_STATE_TTL_SECONDS = 15 * 60

export interface WechatChatRunState {
  sourceMessageId: string
  nextSequence: number
  responseMessageContent: string
  responseTextStreamId?: string
  pendingFinalTextContent?: string
  pendingFinalTextStreamId?: string
  currentTextSegmentContent?: string
  currentTextSegmentStreamId?: string
  sentIntermediateTextContent?: string
  nextIntermediateSegmentIndex?: number
  hasIntermediateTextSent?: boolean
  finalMessageContent?: string
  terminalError?: string
  runCreatedAt: number
  firstCallbackAt?: number
  context: WechatChatCallbackContext
  pendingEvents: Record<string, WechatChatCallbackPayload>
}

@Injectable()
export class WechatChatRunStateService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  async save(state: WechatChatRunState, ttlSeconds: number = DEFAULT_RUN_STATE_TTL_SECONDS): Promise<void> {
    await this.cacheManager.set(this.buildKey(state.sourceMessageId), state, ttlSeconds * 1000)
  }

  async get(sourceMessageId: string): Promise<WechatChatRunState | null> {
    const state = await this.cacheManager.get<WechatChatRunState>(this.buildKey(sourceMessageId))
    return state ?? null
  }

  async clear(sourceMessageId: string): Promise<void> {
    await this.cacheManager.del(this.buildKey(sourceMessageId))
  }

  private buildKey(sourceMessageId: string): string {
    return `wechat:handoff:run:${sourceMessageId}`
  }
}
