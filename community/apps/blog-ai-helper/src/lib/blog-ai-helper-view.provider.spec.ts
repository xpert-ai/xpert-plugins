import type { Repository } from 'typeorm'
import { BlogAiHelperViewProvider } from './blog-ai-helper-view.provider.js'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import { BlogArticleRecord } from './entities/index.js'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  BLOG_AI_HELPER_PROVIDER_KEY,
  BLOG_AI_HELPER_VIEW_KEY
} from './constants.js'

function createRepository<T extends { id?: string }>(initial: T[] = []) {
  const items = [...initial]
  let nextId = items.length + 1

  return {
    items,
    create(input: Partial<T>) {
      return { ...input } as T
    },
    async save(input: T | T[]) {
      if (Array.isArray(input)) {
        const saved: T[] = []
        for (const item of input) {
          saved.push(await this.save(item))
        }
        return saved
      }
      const entity = { ...input }
      entity.id ??= `id-${nextId++}`
      const index = items.findIndex((item) => item.id === entity.id)
      if (index >= 0) {
        items[index] = entity
      } else {
        items.push(entity)
      }
      return entity
    },
    async findOne(options: { where: Partial<T> }) {
      return items.find((item) => matchesWhere(item, options.where)) ?? null
    },
    async findAndCount(options?: { where?: Partial<T> }) {
      const filtered = options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
      return [filtered, filtered.length]
    },
    async delete(options: Partial<T>) {
      const before = items.length
      for (let index = items.length - 1; index >= 0; index--) {
        if (matchesWhere(items[index], options)) {
          items.splice(index, 1)
        }
      }
      return { affected: before - items.length }
    }
  } satisfies Partial<Repository<T>> & { items: T[] }
}

function matchesWhere<T>(item: T, where: Partial<T>) {
  return Object.entries(where).every(([key, expected]) => {
    const value = Reflect.get(item, key)
    return expected === undefined || value === expected
  })
}

function asRepository<T extends { id?: string }>(repository: ReturnType<typeof createRepository<T>>) {
  return repository as unknown as Repository<T>
}

function createProvider() {
  const repository = createRepository<BlogArticleRecord>()
  const service = new BlogAiHelperService(asRepository(repository))
  const provider = new BlogAiHelperViewProvider(service)
  return { provider, service, repository }
}

const agentContext = {
  hostType: 'agent',
  hostId: 'xpert-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1'
} as const

describe('BlogAiHelperViewProvider', () => {
  it('supports agent hosts only', () => {
    const { provider } = createProvider()
    expect(provider.supports({ ...agentContext, hostType: 'agent' })).toBe(true)
    expect(provider.supports({ ...agentContext, hostType: 'project' })).toBe(false)
  })

  it('returns a workbench view manifest for the agent fixed slot', () => {
    const { provider } = createProvider()
    const manifests = provider.getViewManifests(
      { ...agentContext, hostType: 'agent' },
      AGENT_WORKBENCH_FIXED_SLOT
    )

    expect(manifests).toHaveLength(1)
    const manifest = manifests[0]
    expect(manifest.key).toBe(BLOG_AI_HELPER_VIEW_KEY)
    expect(manifest.source.provider).toBe(BLOG_AI_HELPER_PROVIDER_KEY)
    expect(manifest.view.type).toBe('remote_component')
    expect(manifest.actions.map((action) => action.key)).toEqual(
      expect.arrayContaining(['process_article', 'regenerate_article', 'confirm_record', 'delete_record'])
    )
  })

  it('rejects processing an empty article', async () => {
    const { provider } = createProvider()
    const result = await provider.executeViewAction(
      { ...agentContext, hostType: 'agent' },
      BLOG_AI_HELPER_VIEW_KEY,
      'process_article',
      { input: { content: '   ' } }
    )

    expect(result.success).toBe(false)
  })

  it('processes an article and returns a chat command for dispatch', async () => {
    const { provider } = createProvider()
    const result = await provider.executeViewAction(
      { ...agentContext, hostType: 'agent' },
      BLOG_AI_HELPER_VIEW_KEY,
      'process_article',
      { input: { content: '这是一篇博客文章草稿。', title: '测试文章' } }
    )

    expect(result.success).toBe(true)
    const data = result.data as {
      recordId: string
      commandKey: string
      payload: { text: string; state: { blogAiHelper: { recordId: string } } }
    }
    expect(data.recordId).toBeTruthy()
    expect(data.commandKey).toBe('assistant.chat.send_message')
    expect(data.payload.state.blogAiHelper.recordId).toBe(data.recordId)
  })

  it('confirms a reviewing record through the action', async () => {
    const { provider } = createProvider()
    const created = await provider.executeViewAction(
      { ...agentContext, hostType: 'agent' },
      BLOG_AI_HELPER_VIEW_KEY,
      'process_article',
      { input: { content: '文章正文内容。' } }
    )
    const recordId = (created.data as { recordId: string }).recordId

    await provider.service.saveAnalysis(
      { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
      { recordId, summary: '摘要。', tags: ['标签'], titleSuggestions: ['标题'] }
    )

    const confirmed = await provider.executeViewAction(
      { ...agentContext, hostType: 'agent' },
      BLOG_AI_HELPER_VIEW_KEY,
      'confirm_record',
      { targetId: recordId }
    )

    expect(confirmed.success).toBe(true)
    expect((confirmed.data as { status: string }).status).toBe('saved')
  })
})
