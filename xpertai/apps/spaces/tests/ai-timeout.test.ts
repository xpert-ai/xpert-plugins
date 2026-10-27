import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AgentMiddlewareRuntimeServiceApi } from '@xpert-ai/plugin-sdk'
import { SpaceAi } from '../src/ai.js'
import type { SpacePages } from '../src/pages.js'
import type { SpacesService } from '../src/spaces.js'
import type { SpaceKnowledge } from '../src/knowledge.js'

test('AI deadline rejects an unresponsive provider and never saves its late answer', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let proposals = 0
  let resolveModel!: (model: BaseChatModel) => void
  const pendingModel = new Promise<BaseChatModel>((resolve) => { resolveModel = resolve })
  const pages = {
    access: { resource: async () => undefined },
    read: async () => ({ sequence: 1, blocks: [{ id: 'block', text: 'Before' }], markdown: 'Before', item: { title: 'Page' } }),
    propose: async () => { proposals++; return {} }
  } as unknown as SpacePages
  const runtime = {
    createScopedApi: () => ({ getDefaultChatModel: async () => ({}), createModelClient: async () => pendingModel })
  } as unknown as AgentMiddlewareRuntimeServiceApi
  const ai = new SpaceAi(pages, {} as SpacesService, {} as SpaceKnowledge, runtime)
  const response = ai.rewrite({ tenantId: 'tenant', organizationId: 'org', userId: 'user' }, 'page', 'block', 'Rewrite', 1)
  const rejected = assert.rejects(response, /spaces.ai_timeout/)
  // Let permission checks complete and the provider enter client initialization.
  await new Promise<void>((resolve) => setImmediate(resolve))
  context.mock.timers.tick(90000)
  await rejected
  resolveModel({ invoke: async () => ({ content: 'Late answer' }) } as unknown as BaseChatModel)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(proposals, 0)
})
