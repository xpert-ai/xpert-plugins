import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { type Cache } from 'cache-manager'
import { WechatPersonalChatCallbackContext, WechatPersonalChatCallbackPayload } from './wechat-personal-chat.types.js'

const DEFAULT_RUN_STATE_TTL_SECONDS = 15 * 60

export interface WechatPersonalChatRunState {
  sourceMessageId: string
  nextSequence: number
  responseMessageContent: string
  finalMessageContent?: string
  terminalError?: string
  runCreatedAt: number
  firstCallbackAt?: number
  context: WechatPersonalChatCallbackContext
  pendingEvents: Record<string, WechatPersonalChatCallbackPayload>
}

@Injectable()
export class WechatPersonalChatRunStateService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  async save(state: WechatPersonalChatRunState, ttlSeconds: number = DEFAULT_RUN_STATE_TTL_SECONDS): Promise<void> {
    await this.cacheManager.set(this.buildKey(state.sourceMessageId), state, ttlSeconds * 1000)
  }

  async get(sourceMessageId: string): Promise<WechatPersonalChatRunState | null> {
    const state = await this.cacheManager.get<WechatPersonalChatRunState>(this.buildKey(sourceMessageId))
    return state ?? null
  }

  async clear(sourceMessageId: string): Promise<void> {
    await this.cacheManager.del(this.buildKey(sourceMessageId))
  }

  private buildKey(sourceMessageId: string): string {
    return `wechat-personal:handoff:run:${sourceMessageId}`
  }
}
