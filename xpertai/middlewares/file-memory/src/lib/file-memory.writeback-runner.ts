import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { Injectable, Logger } from '@nestjs/common'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { XpertFileMemoryService } from './file-memory.service.js'
import { decideMemoryWriteback } from './file-memory.writeback.js'
import { SEMANTIC_MEMORY_KINDS } from './memory-taxonomy.js'
import { SandboxMemoryStore } from './sandbox-memory.store.js'
import { MemoryScope } from './types.js'

type FileMemoryWritebackSnapshot = {
  store: SandboxMemoryStore
  scope: MemoryScope
  messages: BaseMessage[]
  context: Pick<IAgentMiddlewareContext, 'userId' | 'conversationId'>
  getModel: () => Promise<BaseChatModel>
  qaPrompt?: string
  profilePrompt?: string
  enableLogging?: boolean
}

type RunnerSlot = {
  pending?: FileMemoryWritebackSnapshot
  current?: Promise<void>
  running: boolean
}

const MAX_WRITEBACK_ERROR_LOG_CHARS = 500

@Injectable()
export class FileMemoryWritebackRunner {
  private readonly logger = new Logger(FileMemoryWritebackRunner.name)
  private readonly slots = new Map<string, RunnerSlot>()

  constructor(private readonly fileMemoryService: XpertFileMemoryService) {}

  enqueue(snapshot: FileMemoryWritebackSnapshot) {
    const key = createScopeKey(snapshot)
    const slot = this.slots.get(key) ?? { running: false }
    const wasRunning = slot.running

    slot.pending = snapshot
    this.slots.set(key, slot)

    if (snapshot.enableLogging) {
      this.logger.debug(
        `[FileMemorySystem] queued writeback for ${key}${wasRunning ? ' (coalesced latest snapshot)' : ''}`
      )
    }

    if (!slot.running) {
      slot.running = true
      slot.current = this.runSlot(key, slot)
    }

    return key
  }

  async softDrain(key: string, timeoutMs: number) {
    const slot = this.slots.get(key)
    if (!slot?.current) {
      return true
    }

    const drained = await Promise.race([
      slot.current.then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), Math.max(1, timeoutMs))
      })
    ])

    if (!drained) {
      this.logger.warn(`[FileMemorySystem] soft-drain timed out for ${key} after ${timeoutMs}ms`)
    }

    return drained
  }

  private async runSlot(key: string, slot: RunnerSlot) {
    try {
      while (slot.pending) {
        const snapshot = slot.pending
        slot.pending = undefined
        await this.processSnapshot(key, snapshot)
      }
    } finally {
      slot.running = false
      slot.current = undefined
      if (slot.pending) {
        slot.running = true
        slot.current = this.runSlot(key, slot)
        return
      }
      this.slots.delete(key)
    }
  }

  private async processSnapshot(key: string, snapshot: FileMemoryWritebackSnapshot) {
    try {
      const model = await snapshot.getModel()
      const conversationText = formatConversationForSearch(snapshot.messages)
      if (!conversationText) {
        return
      }

      if (snapshot.enableLogging) {
        this.logger.debug(`[FileMemorySystem] writeback runner start for ${key}`)
      }

      for (const semanticKind of SEMANTIC_MEMORY_KINDS) {
        const customPrompt = semanticKind === 'user' ? snapshot.profilePrompt : snapshot.qaPrompt
        try {
          const candidates = await this.fileMemoryService.search(snapshot.store, snapshot.scope, {
            text: conversationText,
            semanticKinds: [semanticKind],
            userId: snapshot.context.userId,
            audience: 'all',
            includeArchived: false,
            includeFrozen: false,
            limit: 5
          })

          const decision = await decideMemoryWriteback(model, semanticKind, snapshot.messages, candidates, customPrompt)
          if (decision.action === 'archive') {
            await this.fileMemoryService.applyGovernance(
              snapshot.store,
              snapshot.scope,
              decision.memoryId,
              'archive',
              snapshot.context.userId,
              {
                userId: snapshot.context.userId,
                audience: 'all'
              }
            )
          } else if (decision.action === 'upsert') {
            await this.fileMemoryService.upsert(snapshot.store, {
              scope: snapshot.scope,
              audience: decision.audience ?? undefined,
              ownerUserId: decision.audience === 'user' ? snapshot.context.userId : undefined,
              kind: decision.kind,
              semanticKind: decision.semanticKind,
              memoryId: decision.memoryId,
              title: decision.title,
              content: decision.content,
              context: decision.context ?? undefined,
              tags: decision.tags ?? undefined,
              source: 'writeback',
              sourceRef: snapshot.context.conversationId ? `conversation:${snapshot.context.conversationId}` : undefined,
              createdBy: snapshot.context.userId,
              updatedBy: snapshot.context.userId
            })
          }

          if (snapshot.enableLogging) {
            this.logger.debug(`[FileMemorySystem] writeback ${semanticKind} decision=${decision.action} for ${key}`)
          }
        } catch (error) {
          this.logger.warn(
            `[FileMemorySystem] ${semanticKind} writeback skipped for ${key}: ${summarizeWritebackError(error)}`
          )
        }
      }

      if (snapshot.enableLogging) {
        this.logger.debug(`[FileMemorySystem] writeback runner complete for ${key}`)
      }
    } catch (error) {
      this.logger.warn(
        `[FileMemorySystem] background writeback failed for ${key}: ${summarizeWritebackError(error)}`
      )
    }
  }
}

function createScopeKey(snapshot: FileMemoryWritebackSnapshot) {
  return [
    snapshot.store.cacheKey,
    snapshot.scope.scopeType,
    snapshot.scope.scopeId,
    snapshot.context.userId
  ].join(':')
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: string }).text ?? '')
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

function formatConversationForSearch(messages: BaseMessage[]) {
  return messages
    .slice(-18)
    .map((message) => {
      if (isHumanMessage(message)) {
        return `user: ${stringifyMessageContent(message.content)}`
      }
      if (isToolMessage(message)) {
        const toolMessage = message as { name?: string; content?: unknown }
        return `tool(${toolMessage.name ?? 'unknown'}): ${stringifyMessageContent(toolMessage.content)}`
      }
      if (isAIMessage(message)) {
        const aiMessage = message as { content?: unknown }
        return `assistant: ${stringifyMessageContent(aiMessage.content)}`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 12_000)
}

function summarizeWritebackError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const compactMessage = message.replace(/\s+/g, ' ').trim()

  if (compactMessage.length <= MAX_WRITEBACK_ERROR_LOG_CHARS) {
    return compactMessage
  }

  return `${compactMessage.slice(0, MAX_WRITEBACK_ERROR_LOG_CHARS)}... [truncated ${compactMessage.length - MAX_WRITEBACK_ERROR_LOG_CHARS} chars]`
}
