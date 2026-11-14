import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Repository } from 'typeorm'
import { BlogArticleRecord } from './entities/index.js'
import type {
  BlogAiHelperChatCommand,
  BlogAiHelperScope,
  BlogAiHelperWorkbenchQuery,
  CreateArticleRecordInput,
  SaveArticleAnalysisInput
} from './types.js'

type ScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  createdById?: string | null
}

@Injectable()
export class BlogAiHelperService {
  constructor(
    @InjectRepository(BlogArticleRecord)
    private readonly recordRepository: Repository<BlogArticleRecord>
  ) {}

  async createArticleRecord(scope: BlogAiHelperScope, input: CreateArticleRecordInput) {
    const content = normalizeRequired(input.content, '文章内容不能为空，请先粘贴文章草稿。')
    const title = normalizeOptional(input.title) ?? createDefaultTitle(content)

    const record = await this.recordRepository.save(
      this.recordRepository.create({
        ...scopedCreate(scope),
        title,
        content,
        xpertId: normalizeOptional(input.xpertId),
        agentKey: normalizeOptional(input.agentKey),
        status: 'analyzing'
      })
    )

    return this.toRecordDto(record)
  }

  async prepareProcessChatMessage(scope: BlogAiHelperScope, recordId: string): Promise<BlogAiHelperChatCommand> {
    const record = await this.requireRecord(scope, recordId)

    const nextStatus = record.status === 'failed' ? 'analyzing' : 'analyzing'
    await this.recordRepository.save({
      ...record,
      status: nextStatus,
      errorMessage: undefined
    })

    const clientMessageId = `blog-ai-helper:process:${record.id}`
    return {
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: buildProcessPrompt(record),
        clientMessageId,
        followUpMode: 'queue',
        state: {
          blogAiHelper: {
            action: 'process_article',
            recordId: record.id ?? recordId
          }
        }
      },
      recordId: record.id ?? recordId
    }
  }

  async saveAnalysis(scope: BlogAiHelperScope, input: SaveArticleAnalysisInput) {
    const record = await this.requireRecord(scope, input.recordId)
    const errorMessage = normalizeOptional(input.errorMessage)

    if (errorMessage) {
      const saved = await this.recordRepository.save({
        ...record,
        status: 'failed',
        errorMessage
      })
      return this.toRecordDto(saved)
    }

    const summary = normalizeRequired(input.summary, 'AI 摘要不能为空。')
    const tags = normalizeStringArray(input.tags)
    const titleSuggestions = normalizeStringArray(input.titleSuggestions)

    const saved = await this.recordRepository.save({
      ...record,
      summary,
      tags,
      titleSuggestions,
      errorMessage: undefined,
      status: 'reviewing'
    })

    return this.toRecordDto(saved)
  }

  async reportFailure(scope: BlogAiHelperScope, recordId: string, errorMessage: string) {
    const record = await this.requireRecord(scope, recordId)
    const message = normalizeRequired(errorMessage, '失败原因不能为空。')

    const saved = await this.recordRepository.save({
      ...record,
      status: 'failed',
      errorMessage: message
    })

    return this.toRecordDto(saved)
  }

  async confirmRecord(scope: BlogAiHelperScope, recordId: string) {
    const record = await this.requireRecord(scope, recordId)
    if (record.status === 'failed') {
      throw new BadRequestException('处理失败的记录不能保存，请先重新生成。')
    }

    const saved = await this.recordRepository.save({
      ...record,
      status: 'saved'
    })

    return this.toRecordDto(saved)
  }

  async deleteRecord(scope: BlogAiHelperScope, recordId: string) {
    await this.requireRecord(scope, recordId)
    await this.recordRepository.delete(scopedWhere(scope, { id: recordId }))
    return { deleted: true, recordId }
  }

  async getWorkbenchData(scope: BlogAiHelperScope, query: BlogAiHelperWorkbenchQuery) {
    if (query.recordId) {
      const record = await this.recordRepository.findOne({
        where: scopedWhere(scope, { id: query.recordId })
      })
      if (!record) {
        throw new NotFoundException('文章处理记录不存在。')
      }
      return { item: this.toRecordDto(record) }
    }

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20))
    const search = normalizeOptional(query.search)

    const where = scopedWhere(scope)
    if (search) {
      Object.assign(where, {
        title: Like(`%${escapeLike(search)}%`)
      })
    }

    const [items, total] = await this.recordRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    return {
      items: items.map((item) => this.toRecordDto(item)),
      total,
      page,
      pageSize
    }
  }

  private async requireRecord(scope: BlogAiHelperScope, recordId: string) {
    const record = await this.recordRepository.findOne({
      where: scopedWhere(scope, { id: recordId })
    })
    if (!record) {
      throw new NotFoundException('文章处理记录不存在。')
    }
    return record
  }

  private toRecordDto(record: BlogArticleRecord) {
    return {
      id: record.id,
      title: record.title,
      content: record.content,
      summary: record.summary ?? null,
      tags: record.tags ?? [],
      titleSuggestions: record.titleSuggestions ?? [],
      status: record.status ?? 'draft',
      errorMessage: record.errorMessage ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }
}

function scopedCreate(scope: BlogAiHelperScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function scopedWhere<T extends ScopedEntity>(scope: BlogAiHelperScope, extra?: Partial<T> & { id?: string }): Partial<T> {
  const where = {
    tenantId: scope.tenantId
  } as Partial<T>

  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }

  return {
    ...where,
    ...extra
  }
}

function normalizeRequired(value: string | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeStringArray(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

function createDefaultTitle(content: string) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)
  if (firstLine) {
    return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine
  }
  return '未命名文章'
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function buildProcessPrompt(record: BlogArticleRecord) {
  return [
    '请处理下面这篇文章草稿，为博客作者生成发布辅助内容。',
    '',
    `记录编号：${record.id ?? ''}`,
    `文章标题（可作参考）：${record.title ?? ''}`,
    '',
    '【文章草稿开始】',
    record.content ?? '',
    '【文章草稿结束】',
    '',
    '请完成以下任务：',
    '1. 用 2-3 句中文精炼概括文章核心观点（summary）。',
    '2. 提炼 3-6 个中文标签（tags），覆盖主题、行业与读者价值。',
    '3. 给出 3-5 个备选标题（titleSuggestions），兼顾点击吸引力与内容准确性。',
    '',
    '完成后调用 blog_save_analysis 工具，把 recordId、summary、tags、titleSuggestions 原样保存。',
    '如果文章内容为空或无法理解，调用 blog_report_failure 并说明原因。'
  ].join('\n')
}
