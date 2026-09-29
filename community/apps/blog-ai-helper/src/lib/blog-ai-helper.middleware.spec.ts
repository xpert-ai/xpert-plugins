import type { Repository } from 'typeorm'
import { BlogAiHelperMiddleware } from './blog-ai-helper.middleware.js'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import { BlogArticleRecord } from './entities/index.js'
import { BLOG_AI_HELPER_MIDDLEWARE_NAME } from './constants.js'
import type { BlogAiHelperScope } from './types.js'

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

const context = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  xpertId: 'xpert-1',
  conversationId: 'conversation-1'
} as unknown as Parameters<BlogAiHelperMiddleware['createMiddleware']>[1]

describe('BlogAiHelperMiddleware', () => {
  it('declares the middleware meta with the blog feature', () => {
    const repository = createRepository<BlogArticleRecord>()
    const middleware = new BlogAiHelperMiddleware(
      new BlogAiHelperService(asRepository(repository))
    )

    expect(middleware.meta.name).toBe(BLOG_AI_HELPER_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toContain('blog_ai_helper')
    expect(middleware.meta.label.zh_Hans).toBe('博客文章AI智能助手')
  })

  it('creates tools blog_save_analysis and blog_report_failure', () => {
    const repository = createRepository<BlogArticleRecord>()
    const middleware = new BlogAiHelperMiddleware(
      new BlogAiHelperService(asRepository(repository))
    )

    const agentMiddleware = middleware.createMiddleware({}, context)
    expect(agentMiddleware.name).toBe(BLOG_AI_HELPER_MIDDLEWARE_NAME)

    const tools = agentMiddleware.tools
    const toolNames = tools.map((tool) => tool.name)
    expect(toolNames).toContain('blog_save_analysis')
    expect(toolNames).toContain('blog_report_failure')
  })

  it('saves analysis through the tool and moves the record to reviewing', async () => {
    const repository = createRepository<BlogArticleRecord>()
    const service = new BlogAiHelperService(asRepository(repository))
    const middleware = new BlogAiHelperMiddleware(service)

    const record = await service.createArticleRecord(
      { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
      { content: '文章草稿正文。' }
    )

    const agentMiddleware = middleware.createMiddleware({}, context)
    const saveTool = agentMiddleware.tools.find((tool) => tool.name === 'blog_save_analysis')!
    const output = await saveTool.invoke({
      recordId: record.id!,
      summary: 'AI 生成的摘要。',
      tags: ['标签1', '标签2'],
      titleSuggestions: ['备选标题1']
    })

    const parsed = JSON.parse(typeof output === 'string' ? output : String(output)) as { id?: string; status?: string }
    expect(parsed.status).toBe('reviewing')

    const detail = await service.getWorkbenchData(
      { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
      { recordId: record.id! }
    )
    expect(detail.item!.summary).toBe('AI 生成的摘要。')
  })
})
