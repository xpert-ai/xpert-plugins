import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { PLUGIN_CONFIG_RESOLVER_TOKEN, type IPluginConfigResolver } from '@xpert-ai/plugin-sdk'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ONTOAGENT_PLUGIN_NAME } from './constants.js'
import {
  resolveOntoAgentPluginConfig,
  type OntoAgentPluginConfig,
  type ResolvedOntoAgentPluginConfig
} from './ontoagent.config.js'
import { OntoAgentAnswerRecord, OntoAgentSyncRun } from './entities/index.js'
import type { OntoAgentAnswerStatus, OntoAgentMiddlewareOptions, OntoAgentScope } from './types.js'
import { OntologyStore } from './vendor/dsh-ontology-store/index.js'
import { compileGovernedContext } from './vendor/dsh-ontology-core/index.js'
import type { Assertion, Node } from './vendor/dsh-ontology-core/index.js'
import {
  createHttpAutoOntologyPort,
  readAutoSyncManifest,
  syncAutoOntology,
  type AutoSyncManifest
} from './vendor/dsh-auto-ontology-adapter/index.js'
import { createAutoContextPipeline } from './vendor/auto-pipeline.js'
import type { AutoContextService, PreparedPrompt } from './vendor/pipeline-types.js'

const PAGE_DEFAULT = 20

@Injectable()
export class OntoAgentService {
  private readonly stores = new Map<string, OntologyStore>()

  constructor(
    @InjectRepository(OntoAgentAnswerRecord)
    private readonly answerRepo: Repository<OntoAgentAnswerRecord>,
    @InjectRepository(OntoAgentSyncRun)
    private readonly syncRepo: Repository<OntoAgentSyncRun>,
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  config(): ResolvedOntoAgentPluginConfig {
    const pluginConfig = this.pluginConfigResolver?.resolve<OntoAgentPluginConfig>(ONTOAGENT_PLUGIN_NAME)
    return resolveOntoAgentPluginConfig(pluginConfig)
  }

  private dirFor(scope: OntoAgentScope): string {
    return join(this.config().storeDir, segment(scope.tenantId), segment(scope.organizationId))
  }

  private storeFor(scope: OntoAgentScope): OntologyStore {
    const dir = this.dirFor(scope)
    let store = this.stores.get(dir)
    if (!store) {
      store = new OntologyStore(dir)
      this.stores.set(dir, store)
    }
    return store
  }

  private manifestFor(scope: OntoAgentScope): AutoSyncManifest | null {
    return readAutoSyncManifest(this.dirFor(scope))
  }

  /** 只读镜像视图：与 DSH OntologyService 的 Auto 调用面一致。 */
  private mirrorFor(scope: OntoAgentScope): AutoContextService {
    const store = this.storeFor(scope)
    const dir = this.dirFor(scope)
    const assertions = () => [...store.foldCached().values()]
    return {
      nodes: () => deriveNodes(assertions(), dir),
      assertions,
      health: () => ({ version: store.version() })
    }
  }

  /** 可选 dense 端口：OpenAI 兼容 /embeddings；未配置 = 纯词法路径（不依赖模型）。 */
  private denseFor() {
    const { models } = this.config()
    const baseUrl = models.embedBaseUrl ?? models.baseUrl
    const model = models.embedModel
    if (!baseUrl || !model) return undefined
    const apiKey = models.apiKey ?? ''
    return {
      embed: async (texts: string[]): Promise<number[][]> => {
        if (texts.length === 0) return []
        const response = await fetch(baseUrl.replace(/\/$/, '') + '/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({ model, input: texts })
        })
        if (!response.ok) throw new Error(`embed_http_${response.status}`)
        const data = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> }
        const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index)
        if (rows.length !== texts.length) throw new Error('embed_count_mismatch')
        return rows.map((row) => row.embedding)
      }
    }
  }

  private pipelineFor(scope: OntoAgentScope, overrides?: OntoAgentMiddlewareOptions) {
    const config = this.config()
    const dir = this.dirFor(scope)
    return createAutoContextPipeline({
      service: this.mirrorFor(scope),
      manifest: () => readAutoSyncManifest(dir),
      dense: this.denseFor(),
      gate: {
        threshold: config.gate.threshold,
        thresholdVersion: config.gate.thresholdVersion,
        ...(config.gate.gateOn ? { gateOn: config.gate.gateOn } : {}),
        denseLimit: config.gate.denseLimit,
        rerankLimit: config.gate.rerankLimit
      },
      maxTerms: overrides?.maxTerms ?? config.budget.maxTerms,
      maxAssertions: overrides?.maxAssertions ?? config.budget.maxAssertions,
      maxChars: overrides?.maxChars ?? config.budget.maxChars
    })
  }

  async prepareForTask(scope: OntoAgentScope, task: string, overrides?: OntoAgentMiddlewareOptions) {
    const prepared = await this.pipelineFor(scope, overrides).prepareForTask(task)
    return { prepared, manifest: this.manifestFor(scope) }
  }

  /** 手动同步/重试：幂等（重复快照零操作）；失败写运行记录且原因可见。 */
  async syncNow(scope: OntoAgentScope) {
    const config = this.config()
    const dir = this.dirFor(scope)
    if (!config.apiUrl || !config.apiToken) {
      const message = 'auto_config_missing: 请在插件配置中提供 Auto-Ontology API 地址与令牌'
      await this.recordSyncRun(scope, 'failed', { errorMessage: message })
      throw new Error(message)
    }
    try {
      const port = createHttpAutoOntologyPort({
        baseUrl: config.apiUrl,
        token: config.apiToken,
        databaseIds: config.databaseIds,
        source: config.source
      })
      const result = await syncAutoOntology({ port, storeDir: dir })
      const manifest = readAutoSyncManifest(dir)
      await this.recordSyncRun(scope, result.status, {
        mirrorVersion: result.mirrorVersion,
        sourceDigest: result.sourceDigest,
        assertionCount: manifest?.assertionCount,
        excluded: manifest?.excluded,
        unsupported: manifest?.unsupported,
        attempts: result.attempts,
        errorMessage: manifest?.lastError
      })
      return { result, manifest }
    } catch (error) {
      const message = errorMessage(error)
      await this.recordSyncRun(scope, 'failed', { errorMessage: message })
      throw new Error(message)
    }
  }

  private async recordSyncRun(
    scope: OntoAgentScope,
    status: OntoAgentSyncRun['status'],
    fields: Partial<OntoAgentSyncRun>
  ) {
    return this.syncRepo.save(
      this.syncRepo.create({
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: scope.userId ?? null,
        triggerType: 'manual',
        status,
        ...fields
      } as OntoAgentSyncRun)
    )
  }

  async getStatus(scope: OntoAgentScope) {
    const store = this.storeFor(scope)
    const recentRuns = await this.syncRepo.find({
      where: tenantWhere(scope),
      order: { createdAt: 'DESC' },
      take: 5
    })
    return {
      items: recentRuns,
      total: recentRuns.length,
      mirrorVersion: store.version(),
      assertionCount: store.foldCached().size,
      manifest: this.manifestFor(scope)
    }
  }

  async listTerms(scope: OntoAgentScope, query: { search?: string; page?: number; pageSize?: number }) {
    const mirror = this.mirrorFor(scope)
    const assertions = mirror.assertions()
    const search = query.search?.trim().toLowerCase()
    const terms = mirror
      .nodes()
      .filter((node) => node.id.startsWith('auto:term:'))
      .map((node) => ({
        id: node.id,
        label: node.labels?.[0] ?? node.id,
        aliases: node.aliases ?? [],
        status: node.status ?? 'accepted',
        assertionCount: assertions.filter((a) => a.s === node.id).length
      }))
      .filter((term) =>
        search
          ? term.id.toLowerCase().includes(search) ||
            term.label.toLowerCase().includes(search) ||
            term.aliases.some((alias) => alias.toLowerCase().includes(search))
          : true
      )
      .sort((a, b) => a.id.localeCompare(b.id))
    return paginate(terms, query)
  }

  async listAnswers(
    scope: OntoAgentScope,
    query: { status?: OntoAgentAnswerStatus; page?: number; pageSize?: number }
  ) {
    const where = { ...tenantWhere(scope), assistantId: scope.assistantId ?? IsNull() }
    const [items, total] = await this.answerRepo.findAndCount({
      where: query.status ? { ...where, status: query.status } : where,
      order: { createdAt: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? PAGE_DEFAULT),
      take: query.pageSize ?? PAGE_DEFAULT
    })
    return { items, total, page: query.page ?? 1, pageSize: query.pageSize ?? PAGE_DEFAULT }
  }

  /** afterAgent 落"待确认"记录；同对话同内容去重，重试/工具循环不产生重复业务结果。 */
  async recordProposedAnswer(
    scope: OntoAgentScope,
    input: { question: string; answer: string; prepared: PreparedPrompt; error?: string }
  ) {
    const answer = input.answer.trim()
    if (!answer) return null
    const manifest = this.manifestFor(scope)
    const stale = manifest?.stale === true || input.prepared.retrieval.reason === 'auto_snapshot_stale'
    const duplicated = await this.answerRepo.findOne({
      where: {
        ...tenantWhere(scope),
        conversationId: scope.conversationId ?? IsNull(),
        question: input.question,
        answer,
        mirrorVersion: input.prepared.version
      }
    })
    if (duplicated) return duplicated
    return this.answerRepo.save(
      this.answerRepo.create({
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        question: input.question,
        answer,
        status: 'proposed',
        mirrorVersion: input.prepared.version,
        sourceDigest: manifest?.sourceDigest,
        stale,
        retrieval: input.prepared.retrieval,
        errorMessage: input.error ?? null
      } as OntoAgentAnswerRecord)
    )
  }

  async reviewAnswer(scope: OntoAgentScope, id: string, action: 'confirmed' | 'rejected', comment?: string) {
    const record = await this.answerRepo.findOne({ where: { id, ...tenantWhere(scope) } })
    if (!record) throw new Error('answer_record_not_found')
    if (record.status === action) return record
    record.status = action
    record.reviewComment = comment?.trim() || record.reviewComment
    record.reviewedAt = new Date()
    return this.answerRepo.save(record)
  }

  /** 词法编译公共入口（只读工具共用）；candidateTerms 用于按术语精确取包。 */
  private compile(scope: OntoAgentScope, task: string, candidateTerms?: string[], overrides?: OntoAgentMiddlewareOptions) {
    const config = this.config()
    const mirror = this.mirrorFor(scope)
    const manifest = this.manifestFor(scope)
    return compileGovernedContext({
      baseVersion: { hash: mirror.health().version, scope: 'gov:auto' },
      sourceDigest: manifest?.sourceDigest,
      stale: manifest?.stale === true,
      task,
      nodes: mirror.nodes(),
      assertions: mirror.assertions(),
      ...(candidateTerms ? { candidateTerms } : {}),
      maxTerms: overrides?.maxTerms ?? config.budget.maxTerms,
      maxAssertions: overrides?.maxAssertions ?? config.budget.maxAssertions,
      maxChars: overrides?.maxChars ?? config.budget.maxChars
    })
  }

  async toolPrepare(scope: OntoAgentScope, task: string) {
    const { prepared, manifest } = await this.prepareForTask(scope, task)
    return {
      prompt: prepared.prompt,
      mirrorVersion: prepared.version,
      sourceDigest: manifest?.sourceDigest,
      retrieval: prepared.retrieval
    }
  }

  toolSlice(scope: OntoAgentScope, task: string) {
    const result = this.compile(scope, task)
    return {
      prompt: result.prompt,
      focus: result.focus,
      matchedTerms: result.matchedTerms,
      noCoverage: result.noCoverage,
      truncated: result.truncated,
      assertions: result.packet.assertions
    }
  }

  toolQuery(scope: OntoAgentScope, termId: string) {
    const result = this.compile(scope, termId, [termId])
    return { prompt: result.prompt, assertions: result.packet.assertions, truncated: result.truncated }
  }

  toolSearch(scope: OntoAgentScope, task: string) {
    const result = this.compile(scope, task)
    const nodes = this.mirrorFor(scope).nodes()
    return {
      noCoverage: result.noCoverage,
      matchedTerms: result.matchedTerms.map((id) => {
        const node = nodes.find((n) => n.id === id)
        return { id, label: node?.labels?.[0] ?? id, aliases: node?.aliases ?? [] }
      })
    }
  }

  getViewData(scope: OntoAgentScope, query: { viewTab?: string; search?: string; page?: number; pageSize?: number; status?: OntoAgentAnswerStatus }) {
    switch (query.viewTab) {
      case 'terms':
        return this.listTerms(scope, query)
      case 'answers':
        return this.listAnswers(scope, query)
      default:
        return this.getStatus(scope)
    }
  }
}

function segment(value: string | undefined): string {
  return (value?.trim() || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function tenantWhere(scope: OntoAgentScope) {
  return {
    tenantId: scope.tenantId ?? IsNull(),
    organizationId: scope.organizationId ?? IsNull()
  }
}

function paginate<T>(items: T[], query: { page?: number; pageSize?: number }) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? PAGE_DEFAULT
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

/** 与 DSH OntologyService 一致的节点推导：优先 nodes.json，否则按命名空间形状从断言提取。 */
function deriveNodes(assertions: Assertion[], storeDir: string): Node[] {
  const nodesPath = join(storeDir, 'nodes.json')
  if (existsSync(nodesPath)) return JSON.parse(readFileSync(nodesPath, 'utf8')) as Node[]
  const ids = new Set<string>()
  for (const a of assertions) {
    for (const ref of [a.s, a.o]) {
      if (typeof ref !== 'string' || !ref.includes(':')) continue
      const m = /^([a-z][a-z0-9_-]{0,15}):/.exec(ref)
      if (m !== null && ref.length > m[0].length) ids.add(ref)
    }
  }
  return [...ids].sort().map((id) => ({
    id,
    kind: id.startsWith('c:') ? 'class' : id.startsWith('r:') ? 'relation' : 'term',
    scope: 'task:local'
  }) as Node)
}
