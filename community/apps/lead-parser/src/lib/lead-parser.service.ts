import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import { LeadRecord } from './entities'

/** 线索解析结果 */
export interface ParsedLead {
  /** 联系人姓名 */
  name: string | null
  /** 公司名 */
  company: string | null
  /** 意向描述 */
  intent: string | null
  /** 预算（万元，解析不到则为 null） */
  budget: number | null
}

export interface LeadParserScope {
  tenantId?: string
  organizationId?: string
  userId?: string
}

export interface SavedLead extends ParsedLead {
  id: string
  sourceText: string
  createdAt: string
}

interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

const SYSTEM_PROMPT = [
  '你是销售线索信息抽取助手。',
  '从用户给出的线索原文中抽取四个字段，只输出一个 JSON 对象，不要输出任何解释或 Markdown。',
  'JSON 结构：{"name": string|null, "company": string|null, "intent": string|null, "budget": number|null}',
  '规则：',
  '1. name 只填联系人称呼，如「李总」「王经理」，不要带公司名。',
  '2. company 填完整公司/单位名称。',
  '3. intent 用一句话概括客户想做什么，保留原文关键信息。',
  '4. budget 统一换算为「万元」的数字，例如「80万」输出 80，「80万元」输出 80；没有提到预算则输出 null。',
  '5. 无法确定的字段一律输出 null，禁止编造。'
].join('\n')

/**
 * Lead Parser 业务服务
 *
 * - 解析：调用 OpenAI 兼容接口完成真实模型抽取（凭证通过环境变量提供）
 * - 保存：写入平台数据库，带幂等键，重试不会产生重复记录
 */
@Injectable()
export class LeadParserService {
  private readonly logger = new Logger(LeadParserService.name)

  constructor(
    @InjectRepository(LeadRecord)
    private readonly leadRepository: Repository<LeadRecord>
  ) {}

  /**
   * 解析一段自然语言线索文本，提取结构化字段。
   *
   * @param scope 租户/组织/用户上下文，用于数据隔离与审计
   * @param text 线索原文，例如 "XX汽车零部件公司的李总想做新能源产线方案，预算大概80万"
   */
  async parseText(scope: LeadParserScope, text: string): Promise<ParsedLead> {
    if (!text || !text.trim()) {
      throw new BadRequestException('线索文本不能为空')
    }
    const source = text.trim()
    const config = readLlmConfig()
    const content = await this.callModel(config, source)
    return this.normalize(content)
  }

  /**
   * 保存解析后的线索。相同租户下内容一致时返回已有记录（幂等）。
   */
  async saveLead(scope: LeadParserScope, sourceText: string, lead: ParsedLead): Promise<SavedLead> {
    if (!lead || (!lead.name && !lead.company)) {
      throw new BadRequestException('姓名和公司至少解析出一项才能保存')
    }
    const tenantId = scope.tenantId ?? null
    const organizationId = scope.organizationId ?? null
    const dedupeKey = buildDedupeKey(tenantId, organizationId, sourceText, lead)

    const existing = await this.leadRepository.findOne({ where: { dedupeKey } })
    if (existing) {
      return toSavedLead(existing)
    }

    const entity = this.leadRepository.create({
      tenantId,
      organizationId,
      createdBy: scope.userId ?? null,
      dedupeKey,
      sourceText,
      contactName: lead.name,
      companyName: lead.company,
      intent: lead.intent,
      budget: lead.budget,
      model: readModelName(),
      status: 'confirmed'
    })

    try {
      const saved = await this.leadRepository.save(entity)
      return toSavedLead(saved)
    } catch (error) {
      // 并发重试时可能撞上唯一键，回查一次即可保证幂等
      const fallback = await this.leadRepository.findOne({ where: { dedupeKey } })
      if (fallback) {
        return toSavedLead(fallback)
      }
      throw error
    }
  }

  /** 查询已保存线索列表（按创建时间倒序） */
  async listSavedLeads(scope: LeadParserScope): Promise<SavedLead[]> {
    const records = await this.leadRepository.find({
      where: {
        tenantId: scope.tenantId ?? IsNull(),
        organizationId: scope.organizationId ?? IsNull()
      },
      order: { createdAt: 'DESC' },
      take: 50
    })
    return records.map(toSavedLead)
  }

  private async callModel(config: LlmConfig, source: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: source }
          ]
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200)
        this.logger.warn(`模型调用失败: HTTP ${response.status} ${detail}`)
        throw new Error(`模型调用失败（HTTP ${response.status}）：${detail}`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = payload?.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('模型返回为空，请检查模型名称与额度')
      }
      return content
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`模型调用超时（${config.timeoutMs}ms），请稍后重试`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** 把模型输出收敛为固定结构，并做类型与单位兜底 */
  private normalize(content: string): ParsedLead {
    const json = stripCodeFence(content)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(json) as Record<string, unknown>
    } catch {
      throw new Error('模型输出不是合法 JSON，请重试')
    }

    return {
      name: pickText(parsed.name) ?? pickText(parsed.contactName),
      company: pickText(parsed.company) ?? pickText(parsed.companyName),
      intent: pickText(parsed.intent),
      budget: pickBudget(parsed.budget)
    }
  }
}

function readLlmConfig(): LlmConfig {
  const apiKey = process.env.LEAD_PARSER_LLM_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new BadRequestException(
      '未配置模型凭证：请设置环境变量 LEAD_PARSER_LLM_API_KEY（可同时设置 LEAD_PARSER_LLM_BASE_URL、LEAD_PARSER_LLM_MODEL）'
    )
  }
  const baseUrl = process.env.LEAD_PARSER_LLM_BASE_URL?.trim() || 'https://api.openai.com/v1'
  const model = readModelName()
  const timeoutMs = Number(process.env.LEAD_PARSER_LLM_TIMEOUT_MS ?? 30000)
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000
  }
}

function readModelName(): string {
  return process.env.LEAD_PARSER_LLM_MODEL?.trim() || 'gpt-4o-mini'
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  return text ? text : null
}

/** 统一为「万元」整数；数字大于 1000 视为元 */
function pickBudget(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1000 ? Math.round(value / 10000) : Math.round(value)
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) {
      return null
    }
    const num = Number(text.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(num)) {
      return null
    }
    if (/亿/.test(text)) {
      return Math.round(num * 10000)
    }
    if (/万/.test(text)) {
      return Math.round(num)
    }
    return num > 1000 ? Math.round(num / 10000) : Math.round(num)
  }
  return null
}

function buildDedupeKey(
  tenantId: string | null,
  organizationId: string | null,
  sourceText: string,
  lead: ParsedLead
): string {
  const material = [
    tenantId ?? '',
    organizationId ?? '',
    sourceText.trim(),
    lead.name ?? '',
    lead.company ?? '',
    lead.intent ?? '',
    lead.budget === null ? '' : String(lead.budget)
  ].join('|')
  return createHash('sha256').update(material).digest('hex')
}

function toSavedLead(record: LeadRecord): SavedLead {
  return {
    id: record.id ?? '',
    name: record.contactName ?? null,
    company: record.companyName ?? null,
    intent: record.intent ?? null,
    budget: record.budget ?? null,
    sourceText: record.sourceText ?? '',
    createdAt: (record.createdAt instanceof Date
      ? record.createdAt.toISOString()
      : String(record.createdAt ?? ''))
  }
}
