import { BadRequestException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import { BlogArticleRecord } from './entities/index.js'
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
    async findAndCount(options?: { where?: Partial<T>; order?: Record<string, 'ASC' | 'DESC'> }) {
      const filtered = options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
      const orderKey = options?.order ? Object.keys(options.order)[0] : null
      const orderDirection = orderKey ? options.order[orderKey] : null
      if (orderKey && orderDirection) {
        filtered.sort((a, b) => {
          const av = Reflect.get(a, orderKey)
          const bv = Reflect.get(b, orderKey)
          if (orderDirection === 'DESC') return av > bv ? -1 : av < bv ? 1 : 0
          return av < bv ? -1 : av > bv ? 1 : 0
        })
      }
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
    if (expected instanceof RegExp) {
      return typeof value === 'string' && expected.test(value)
    }
    return expected === undefined || value === expected
  })
}

function asRepository<T extends { id?: string }>(repository: ReturnType<typeof createRepository<T>>) {
  return repository as unknown as Repository<T>
}

const scope: BlogAiHelperScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  userId: 'user-1'
}

function createService(seed?: BlogArticleRecord[]) {
  const recordRepository = createRepository<BlogArticleRecord>(seed)
  const service = new BlogAiHelperService(asRepository(recordRepository))
  return { service, recordRepository }
}

describe('BlogAiHelperService', () => {
  it('creates an article record and defaults status to analyzing', async () => {
    const { service, recordRepository } = createService()
    const record = await service.createArticleRecord(scope, {
      content: '  这是一篇博客文章草稿，介绍如何用 AI 提升写作效率。  ',
      title: '我的第一篇博客'
    })

    expect(record.id).toBeTruthy()
    expect(record.title).toBe('我的第一篇博客')
    expect(record.status).toBe('analyzing')
    expect(recordRepository.items).toHaveLength(1)
    expect(recordRepository.items[0].tenantId).toBe('tenant-1')
  })

  it('rejects empty article content with 400', async () => {
    const { service } = createService()
    await expect(
      service.createArticleRecord(scope, { content: '   ' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('saves AI analysis and moves the record to reviewing', async () => {
    const { service } = createService()
    const record = await service.createArticleRecord(scope, {
      content: '博客草稿正文内容。'
    })

    const saved = await service.saveAnalysis(scope, {
      recordId: record.id!,
      summary: '本文介绍 AI 辅助写作的完整流程。',
      tags: ['AI写作', '效率提升', '博客'],
      titleSuggestions: ['AI 写作提效实战', '如何用 AI 写出一篇好博客', '3 步完成博客初稿']
    })

    expect(saved.status).toBe('reviewing')
    expect(saved.summary).toContain('AI 辅助写作')
    expect(saved.tags).toHaveLength(3)
    expect(saved.titleSuggestions).toHaveLength(3)
  })

  it('marks the record as failed when saveAnalysis carries an error message', async () => {
    const { service } = createService()
    const record = await service.createArticleRecord(scope, { content: '无法识别的文本。' })

    const saved = await service.saveAnalysis(scope, {
      recordId: record.id!,
      summary: '占位',
      errorMessage: '文章内容无法解析'
    })

    expect(saved.status).toBe('failed')
    expect(saved.errorMessage).toBe('文章内容无法解析')
  })

  it('confirms a reviewing record into saved', async () => {
    const { service } = createService()
    const record = await service.createArticleRecord(scope, { content: '文章正文。' })
    await service.saveAnalysis(scope, {
      recordId: record.id!,
      summary: '摘要内容。',
      tags: ['标签'],
      titleSuggestions: ['备选标题']
    })

    const saved = await service.confirmRecord(scope, record.id!)
    expect(saved.status).toBe('saved')
  })

  it('rejects confirming a failed record', async () => {
    const { service } = createService()
    const record = await service.createArticleRecord(scope, { content: '正文。' })
    await service.saveAnalysis(scope, {
      recordId: record.id!,
      summary: '占位',
      errorMessage: '失败'
    })

    await expect(service.confirmRecord(scope, record.id!)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lists records scoped to the tenant and returns detail on demand', async () => {
    const { service } = createService()
    const first = await service.createArticleRecord(scope, { content: '第一篇文章内容。', title: '文章A' })
    const second = await service.createArticleRecord(scope, { content: '第二篇文章内容。', title: '文章B' })

    const list = await service.getWorkbenchData(scope, { page: 1, pageSize: 20 })
    expect(list.total).toBe(2)
    expect(list.items.map((item) => item.id).sort()).toEqual([first.id, second.id].sort())

    const detail = await service.getWorkbenchData(scope, { recordId: first.id! })
    expect(detail.item).toBeTruthy()
    expect(detail.item!.title).toBe('文章A')

    const otherTenant = await service.getWorkbenchData(
      { ...scope, tenantId: 'tenant-2' },
      { page: 1, pageSize: 20 }
    )
    expect(otherTenant.total).toBe(0)
  })

  it('deletes a record', async () => {
    const { service, recordRepository } = createService()
    const record = await service.createArticleRecord(scope, { content: '要删除的内容。' })

    const result = await service.deleteRecord(scope, record.id!)
    expect(result.deleted).toBe(true)
    expect(recordRepository.items).toHaveLength(0)
  })

  it('prepares an assistant chat command with the article prompt', async () => {
    const { service } = createService()
    const record = await service.createArticleRecord(scope, {
      content: '这是一篇关于远程办公效率的文章草稿。',
      title: '远程办公'
    })

    const command = await service.prepareProcessChatMessage(scope, record.id!)
    expect(command.commandKey).toBe('assistant.chat.send_message')
    expect(command.payload.text).toContain('远程办公效率')
    expect(command.payload.text).toContain('blog_save_analysis')
    expect(command.payload.state.blogAiHelper.recordId).toBe(record.id)
  })
})
