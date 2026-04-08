import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages'
import { ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CreateModelClientCommand, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { XpertFileMemoryService } from './file-memory.service.js'
import { decideMemoryWriteback } from './file-memory.writeback.js'
import { SEMANTIC_MEMORY_KINDS } from './memory-taxonomy.js'
import { MemoryScope } from './types.js'

type FileMemoryWritebackSnapshot = {
  tenantId: string
  scope: MemoryScope
  messages: BaseMessage[]
  context: Pick<IAgentMiddlewareContext, 'userId' | 'conversationId'>
  model: ICopilotModel
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
  private readonly modelPromises = new Map<string, Promise<BaseChatModel>>()

  constructor(
    private readonly fileMemoryService: XpertFileMemoryService,
    private readonly commandBus: CommandBus
  ) {}

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
      const model = await this.getWritebackModel(snapshot.model)
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
          const candidates = await this.fileMemoryService.search(snapshot.tenantId, snapshot.scope, {
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
              snapshot.tenantId,
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
            await this.fileMemoryService.upsert(snapshot.tenantId, {
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

  private getWritebackModel(modelConfig: ICopilotModel) {
    const key = JSON.stringify(modelConfig)
    let promise = this.modelPromises.get(key)
    if (!promise) {
      promise = this.commandBus.execute(
        new CreateModelClientCommand<BaseChatModel>(modelConfig, {
          usageCallback: () => undefined
        })
      )
      this.modelPromises.set(key, promise)
    }
    return promise
  }
}

function createScopeKey(snapshot: FileMemoryWritebackSnapshot) {
  return [
    snapshot.tenantId,
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
