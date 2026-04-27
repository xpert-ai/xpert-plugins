import { Inject, Injectable } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { type Cache } from 'cache-manager'
import { WeComChatCallbackContext, WeComChatStreamCallbackPayload } from './wecom-chat.types.js'

const DEFAULT_RUN_STATE_TTL_SECONDS = 15 * 60

export interface WeComChatRunState {
  sourceMessageId: string
  nextSequence: number
  responseMessageContent: string
  terminalError?: string
  runCreatedAt: number
  firstCallbackAt?: number
  firstVisibleTextAt?: number
  firstVisiblePushAt?: number
  lastVisiblePushAt?: number
  desiredVisiblePushContent?: string
  lastVisiblePushContent?: string
  context: WeComChatCallbackContext
  pendingEvents: Record<string, WeComChatStreamCallbackPayload>
}

@Injectable()
export class WeComChatRunStateService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  async save(
    state: WeComChatRunState,
    ttlSeconds: number = DEFAULT_RUN_STATE_TTL_SECONDS
  ): Promise<void> {
    await this.cacheManager.set(this.buildKey(state.sourceMessageId), state, ttlSeconds * 1000)
  }

  async get(sourceMessageId: string): Promise<WeComChatRunState | null> {
    const state = await this.cacheManager.get<WeComChatRunState>(this.buildKey(sourceMessageId))
    return state ?? null
  }

  async clear(sourceMessageId: string): Promise<void> {
    await this.cacheManager.del(this.buildKey(sourceMessageId))
  }

  private buildKey(sourceMessageId: string): string {
    return `wecom:handoff:run:${sourceMessageId}`
  }
}
