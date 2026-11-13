import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { PLUGIN_CONFIG_RESOLVER_TOKEN, type IPluginConfigResolver } from '@xpert-ai/plugin-sdk'
import { existsSync, readFileSync } from 'fs'
import { createHash } from 'node:crypto'
import { join } from 'path'
import { ONTOAGENT_PLUGIN_NAME } from './constants.js'
import {
  resolveOntoAgentPluginConfig,
  type OntoAgentPluginConfig,
  type ResolvedOntoAgentPluginConfig
} from './ontoagent.config.js'
import { OntoAgentAnswerRecord, OntoAgentSyncRun, OntoAgentTransfer } from './entities/index.js'
import type { OntoAgentAnswerStatus, OntoAgentMiddlewareOptions, OntoAgentScope } from './types.js'
import { OntologyStore } from './vendor/dsh-ontology-store/index.js'
import {
  compileGovernedContext,
  createTransfer,
  enrichNodes,
  forwardTransfer as forwardTransferProtocol,
  parseDelta,
  validateTransferEnvelope,
  type Assertion,
  type Delta,
  type JudgePort,
  type Node,
  type OntologyTransfer,
  type SubjectGrant
} from './vendor/dsh-ontology-core/index.js'
import { createOntologyService, type OntologyService } from './vendor/ontology-service.js'
import { createPipeline, bootstrapOntology, type CorpusDoc, type Pipeline } from './vendor/ontology-pipeline.js'
import {
  createHttpAutoOntologyPort,
  readAutoSyncManifest,
  syncAutoOntology,
  type AutoSyncManifest
} from './vendor/dsh-auto-ontology-adapter/index.js'
import { createAutoContextPipeline } from './vendor/auto-pipeline.js'
import type { AutoContextService, PreparedPrompt } from './vendor/pipeline-types.js'

const PAGE_DEFAULT = 20
const TRANSFER_VISIBLE_SCOPES = ['task:', 'gov:']

@Injectable()
export class OntoAgentService {
  private readonly stores = new Map<string, OntologyStore>()
  private readonly localServices = new Map<string, OntologyService>()
  private readonly localPipelines = new Map<string, Pipeline>()

  constructor(
    @InjectRepository(OntoAgentAnswerRecord)
    private readonly answerRepo: Repository<OntoAgentAnswerRecord>,
    @InjectRepository(OntoAgentSyncRun)
    private readonly syncRepo: Repository<OntoAgentSyncRun>,
    @InjectRepository(OntoAgentTransfer)
    private readonly transferRepo: Repository<OntoAgentTransfer>,
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

  /** 可选 judge 端口：OpenAI 兼容 /rerank；未配置 = 只用 dense 或词法臂。 */
  private judgeFor(): JudgePort | undefined {
    const { models } = this.config()
    const baseUrl = models.rerankBaseUrl
    const model = models.rerankModel
    if (!baseUrl || !model) return undefined
    const apiKey = models.apiKey ?? ''
    return {
      judge: async (request) => {
        if (request.mode !== 'score') throw new Error('judge_mode_unsupported')
        const response = await fetch(baseUrl.replace(/\/$/, '') + '/rerank', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model,
            query: request.question,
            documents: request.candidates.map((candidate) => candidate.text),
            top_n: request.candidates.length
          })
        })
        if (!response.ok) throw new Error(`rerank_http_${response.status}`)
        const data = (await response.json()) as { results?: Array<{ index: number; relevance_score: number }> }
        const results = data.results ?? []
        if (results.length === 0) throw new Error('rerank_empty')
        return results
          .filter((row) => row.index >= 0 && row.index < request.candidates.length)
          .map((row) => ({ id: request.candidates[row.index]!.id, score: Number(row.relevance_score) }))
      }
    }
  }

  /** 生成端口：OpenAI 兼容 chat；未配置时显式失败（不静默返回空结果）。 */
  private extractPort(): (prompt: string) => Promise<string> {
    const { models } = this.config()
    const baseUrl = models.baseUrl
    const model = models.chatModel
    if (!baseUrl || !model) {
      return async () => {
        throw new Error('chat_model_missing: 配置 models.baseUrl + models.chatModel 后才能生成本体')
      }
    }
    const apiKey = models.apiKey ?? ''
    return async (prompt: string) => {
      const response = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: '你是受治理本体的抽取产线：只输出符合格式的 JSON，不自造关系。' },
            { role: 'user', content: prompt }
          ]
        })
      })
      if (!response.ok) throw new Error(`chat_http_${response.status}`)
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim().length === 0) throw new Error('chat_empty')
      return content
    }
  }

  /** local 产线服务：与镜像同一 store 目录，写入仍走 G0/G1 → 分档 → accepted。 */
  localFor(scope: OntoAgentScope, options?: { autoApproveTopScope?: boolean }): OntologyService {
    const config = this.config()
    const dir = this.dirFor(scope)
    const key = dir + '|' + String(options?.autoApproveTopScope ?? config.write.autoApproveTopScope)
    const cached = this.localServices.get(key)
    if (cached) return cached
    const created = createOntologyService({
      storeDir: dir,
      topScope: 'gov:',
      readOnly: config.contextSource === 'auto',
      askHuman: () => options?.autoApproveTopScope ?? config.write.autoApproveTopScope
    })
    this.localServices.set(key, created)
    return created
  }

  private localPipelineFor(scope: OntoAgentScope): Pipeline {
    const key = this.dirFor(scope)
    const cached = this.localPipelines.get(key)
    if (cached) return cached
    const config = this.config()
    const created = createPipeline({
      service: this.localFor(scope),
      extract: this.extractPort(),
      maxAssertions: config.budget.maxAssertions ?? 40,
      dense: this.denseFor(),
      ...(this.judgeFor() === undefined ? {} : { judge: this.judgeFor() }),
      ...(config.gate.denseLimit === undefined ? {} : { denseLimit: config.gate.denseLimit }),
      ...(config.gate.rerankLimit === undefined ? {} : { rerankLimit: config.gate.rerankLimit })
    })
    this.localPipelines.set(key, created)
    return created
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
    // local：插件自有本体为生产入口，走任务产线（库空时才尝试生成）；auto：受治理镜像只读。
    if (this.config().contextSource === 'local') {
      const prepared = await this.localPipelineFor(scope).prepareForTask(task)
      return { prepared, manifest: null }
    }
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

  /**
   * P-gen：任务/语料 → candidate Delta → 闸门 → accepted。
   * 闸门拒绝、版本冲突与 T2 挂起都如实返回，不用“已生成”掩盖未写入。
   */
  async generate(
    scope: OntoAgentScope,
    input: { task?: string; corpus?: CorpusDoc[]; autoApprove?: boolean }
  ) {
    const config = this.config()
    if (config.contextSource === 'auto') {
      throw new Error('context_source_auto_read_only: auto 模式只接受认证快照，不接受本地产线生成')
    }
    return bootstrapOntology({
      task: input.task,
      corpus: input.corpus,
      extract: this.extractPort(),
      service: this.localFor(scope, { autoApproveTopScope: input.autoApprove }),
      maxAssertions: config.budget.maxAssertions ?? 40
    })
  }

  /** 人工提交 Delta（模型或人写的 JSON）；解析失败不落盘。 */
  async commitDelta(scope: OntoAgentScope, text: string) {
    if (this.config().contextSource === 'auto') throw new Error('context_source_auto_read_only')
    const parsed = parseDelta(text)
    if (!('delta' in parsed)) {
      const failed = parsed as { reason: string; detail: string }
      return { ok: false, stage: 'parse' as const, reasons: [failed.reason + '：' + failed.detail], version: this.localFor(scope).health().version }
    }
    const committed = await this.localFor(scope).commit(parsed.delta as Delta)
    return {
      ok: committed.acceptedIds.length > 0 && !committed.versionConflict,
      stage: committed.versionConflict ? ('conflict' as const) : ('gate' as const),
      acceptedIds: committed.acceptedIds,
      rejected: committed.rejected,
      escalated: committed.escalated,
      needsHuman: committed.needsHuman,
      version: committed.version
    }
  }

  /** 既有本体导入（TTL/OWL）：企业本体是权威，不经模型转述。 */
  async importTtl(scope: OntoAgentScope, ttl: string, source: string) {
    if (this.config().contextSource === 'auto') throw new Error('context_source_auto_read_only')
    if (!ttl.trim()) throw new Error('ttl_empty')
    return this.localFor(scope).importPreset(ttl, { source: source.trim() || 'inline' })
  }

  /** 内置示例本体：幂等导入，重复调用不增长版本。 */
  async seed(scope: OntoAgentScope) {
    const template = JSON.parse(
      readFileSync(new URL('../seed/ontoagent-demo.json', import.meta.url), 'utf8')
    ) as { deltaId: string; ops: Delta['ops'] }
    const service = this.localFor(scope, { autoApproveTopScope: true })
    const version = service.health().version

    // 幂等：所有种子断言 id 已在库（append-only 会把同一断言再写一遍），直接返回现版本。
    const present = new Set(service.assertions().map((item) => item.id))
    const missing = template.ops.filter(
      (op) => !(op.op === 'assert' && present.has(op.assertion.id))
    )
    if (missing.length === 0) {
      return { accepted: 0, rejected: 0, terms: 0, labeled: 0, unknownPredicates: [], version, seeded: false }
    }

    const committed = await service.commit({
      deltaId: template.deltaId,
      baseVersion: { hash: version },
      ops: missing
    })
    return {
      accepted: committed.acceptedIds.length,
      rejected: committed.rejected.length,
      terms: service.nodes().length,
      labeled: service.nodes().filter((node) => (node.labels ?? []).length > 0).length,
      unknownPredicates: [],
      version: committed.version,
      seeded: committed.acceptedIds.length > 0,
      reasons: [...committed.rejected, ...committed.escalated].map((item) => item.rule + ': ' + item.detail)
    }
  }

  localHealth(scope: OntoAgentScope) {
    const local = this.localFor(scope)
    const health = local.health()
    const nodes = enrichNodes(local.nodes(), local.assertions())
    return {
      contextSource: this.config().contextSource,
      ...health,
      terms: nodes.filter((node) => !node.id.startsWith('auto:term:')).length,
      sampleTerms: nodes
        .filter((node) => !node.id.startsWith('auto:term:'))
        .filter((node) => (node.labels ?? []).length > 0)
        .slice(0, 12)
        .map((node) => ({ id: node.id, label: node.labels?.[0] ?? node.id }))
    }
  }

  /** 只读 Packet 转交：协议在 vendor core，运输与去重在本服务。 */
  async transferPacket(
    scope: OntoAgentScope,
    input: {
      recipient: string
      task: string
      taskId?: string
      transferId?: string
      parentTransferId?: string
      maxAssertions?: number
    }
  ) {
    const config = this.config()
    if (config.contextSource === 'auto') throw new Error('transfer_requires_local_context_source')
    const sender = { subjectId: scope.userId?.trim() || 'user:local' }
    const recipient = { subjectId: input.recipient?.trim() ?? '' }
    if (!recipient.subjectId) throw new Error('transfer_recipient_required')
    if (recipient.subjectId === sender.subjectId) throw new Error('transfer_self_forward')

    const parent = input.parentTransferId ? await this.findTransfer(scope, input.parentTransferId) : null
    if (input.parentTransferId && !parent) throw new Error('transfer_parent_not_found')
    const depth = parent ? (parent.depth ?? 0) + 1 : 0
    const limit = Math.min(config.transfer.maxDepth, 8)
    if (depth > limit) {
      return { ok: false, reason: 'transfer_depth_exceeded', depth, limit }
    }

    const local = this.localFor(scope)
    const taskId = input.taskId?.trim() || 'task:' + digestOf(input.task).slice(0, 12)
    let transfer: OntologyTransfer
    if (parent) {
      const forwarded = forwardTransferProtocol({
        transfer: parent.packet as OntologyTransfer,
        // 宿主桥接：同租户内按上一跳接收方转交（平台侧由 assistant 绑定授权，头部已做租户隔离）。
        forwarder: { subjectId: parent.recipient as string },
        grant: this.grantFor(parent.recipient as string),
        recipientGrant: this.grantFor(recipient.subjectId),
        recipient,
        transferId: input.transferId ?? 'tr-' + digestOf(parent.transferId + '|' + recipient.subjectId).slice(0, 16)
      })
      if (!('value' in forwarded)) return { ok: false, reason: 'transfer_rejected', findings: forwarded.findings }
      transfer = forwarded.value.transfer
    } else {
      const found = local.search(input.task, { limit: 12 })
      if (found.focus.length === 0) {
        return { ok: false, reason: 'transfer_no_coverage', noSignal: found.noSignal }
      }
      const packet = local.slice({ focus: found.focus, maxAssertions: input.maxAssertions ?? 40 })
      const created = createTransfer({
        transferId: input.transferId ?? 'tr-' + digestOf(input.task + '|' + recipient.subjectId).slice(0, 16),
        taskId,
        sender,
        recipient,
        packet,
        sourceScope: 'task:local',
        visibleScopes: TRANSFER_VISIBLE_SCOPES
      })
      if (!('value' in created)) return { ok: false, reason: 'transfer_rejected', findings: created.findings }
      transfer = created.value
    }

    const findings = validateTransferEnvelope(transfer)
    if (findings.length > 0) return { ok: false, reason: 'transfer_invalid', findings }
    const packetHash = digestOf(JSON.stringify(transfer.packet))
    // 循环检测：同一 Packet 已在祖先链上出现过（直接父的原样转交是合法的，不算循环）
    const chain = parent ? await this.ancestorChain(scope, parent) : []
    if (chain.some((row) => row.packetHash === packetHash)) {
      return { ok: false, reason: 'transfer_loop_detected', transferId: transfer.transferId, depth }
    }
    const existing = await this.findTransfer(scope, transfer.transferId)
    if (existing) {
      return { ok: true, duplicated: true, transferId: existing.transferId, transfer: existing, packetHash }
    }
    const saved = await this.transferRepo.save(
      this.transferRepo.create({
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: scope.userId ?? null,
        transferId: transfer.transferId,
        kind: 'transfer',
        taskId: transfer.taskId,
        operationId: transfer.transferId,
        status: 'received',
        baseVersion: transfer.packet.baseVersion?.hash,
        packetHash,
        sender: transfer.sender.subjectId,
        recipient: transfer.recipient.subjectId,
        rootId: transfer.provenance.rootTransferId,
        parentId: parent?.transferId,
        depth,
        attempt: 0,
        generation: 1,
        packet: transfer
      } as OntoAgentTransfer)
    )
    return {
      ok: true,
      duplicated: false,
      transferId: transfer.transferId,
      parentTransferId: parent?.transferId,
      depth,
      packetHash,
      baseVersion: transfer.packet.baseVersion?.hash,
      focus: transfer.packet.focus,
      assertions: transfer.packet.assertions.length,
      receipt: saved
    }
  }

  /** 受件方领取：围栏校验后置 done；已 done 的重复领取幂等返回原回执。 */
  async acceptTransfer(
    scope: OntoAgentScope,
    input: { transferId: string; attempt?: number; generation?: number }
  ) {
    const row = await this.findTransfer(scope, input.transferId)
    if (!row) throw new Error('transfer_not_found')
    // 点名到 user: 的 Packet 只能由本人领取；assistant: 由租户内操作者代为领取（受平台绑定授权）。
    const caller = scope.userId?.trim()
    if (row.recipient?.startsWith('user:') && caller && row.recipient !== caller) {
      return { ok: false, reason: 'transfer_recipient_mismatch', recipient: row.recipient }
    }
    if (row.status === 'done') {
      return { ok: true, replayed: true, transfer: row, receipt: row.receipt }
    }
    if (input.generation !== undefined && input.generation !== (row.generation ?? 1)) {
      return { ok: false, reason: 'transfer_generation_stale', expected: row.generation ?? 1 }
    }
    if (input.attempt !== undefined && input.attempt < (row.attempt ?? 0)) {
      return { ok: false, reason: 'transfer_attempt_stale', current: row.attempt ?? 0 }
    }
    row.attempt = (row.attempt ?? 0) + 1
    row.status = 'processing'
    await this.transferRepo.save(row)

    const findings = validateTransferEnvelope(row.packet as OntologyTransfer)
    if (findings.length > 0) {
      row.status = 'rejected'
      row.reason = findings.map((item) => item.rule + ': ' + item.detail).join('; ')
      await this.transferRepo.save(row)
      return { ok: false, reason: 'transfer_invalid', findings, transfer: row }
    }
    row.status = 'done'
    row.receipt = {
      transferId: row.transferId,
      taskId: row.taskId,
      packetId: (row.packet as OntologyTransfer).packet.packetId,
      baseVersion: row.baseVersion,
      packetHash: row.packetHash,
      acceptedAt: new Date().toISOString()
    }
    await this.transferRepo.save(row)
    return { ok: true, replayed: false, transfer: row, receipt: row.receipt }
  }

  async listTransfers(
    scope: OntoAgentScope,
    query: { status?: OntoAgentTransfer['status']; page?: number; pageSize?: number }
  ) {
    const where = { ...tenantWhere(scope), ...(query.status ? { status: query.status } : {}) }
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? PAGE_DEFAULT
    const rows = await this.transferRepo.find({ where, order: { createdAt: 'DESC' }, take: pageSize * 4 })
    const sorted = [...rows].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    return {
      items: sorted.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
        id: row.id,
        transferId: row.transferId,
        taskId: row.taskId,
        status: row.status,
        sender: row.sender,
        recipient: row.recipient,
        depth: row.depth,
        baseVersion: row.baseVersion,
        packetHash: row.packetHash,
        attempt: row.attempt,
        generation: row.generation,
        reason: row.reason,
        receipt: row.receipt,
        createdAt: row.createdAt
      })),
      total: sorted.length,
      page,
      pageSize
    }
  }

  private grantFor(subjectId: string): SubjectGrant {
    return { subjectId, visibleScopes: TRANSFER_VISIBLE_SCOPES, proposableScopes: [] }
  }

  private async findTransfer(scope: OntoAgentScope, transferId: string) {
    return this.transferRepo.findOne({ where: { ...tenantWhere(scope), transferId } })
  }

  private async ancestorChain(scope: OntoAgentScope, row: OntoAgentTransfer) {
    const out: OntoAgentTransfer[] = []
    let cursor: OntoAgentTransfer | null = row
    while (cursor?.parentId && out.length < 16) {
      const parent = await this.findTransfer(scope, cursor.parentId)
      if (!parent) break
      out.push(parent)
      cursor = parent
    }
    return out
  }

  async getStatus(scope: OntoAgentScope) {
    const store = this.storeFor(scope)
    const recentRuns = await this.syncRepo.find({
      where: tenantWhere(scope),
      order: { createdAt: 'DESC' },
      take: 5
    })
    const local = this.localFor(scope)
    const health = local.health()
    const transfers = await this.transferRepo.find({ where: tenantWhere(scope) })
    return {
      contextSource: this.config().contextSource,
      items: recentRuns,
      total: recentRuns.length,
      mirrorVersion: store.version(),
      assertionCount: store.foldCached().size,
      manifest: this.manifestFor(scope),
      local: {
        version: health.version,
        assertions: health.assertions,
        nodes: local.nodes().length,
        terms: local.nodes().filter((node) => !node.id.startsWith('auto:term:')).length,
        invariantViolations: health.invariantViolations
      },
      transfers: {
        total: transfers.length,
        pending: transfers.filter((row) => row.status === 'received' || row.status === 'processing').length,
        done: transfers.filter((row) => row.status === 'done').length
      }
    }
  }

  async listTerms(scope: OntoAgentScope, query: { search?: string; page?: number; pageSize?: number }) {
    const mirror = this.mirrorFor(scope)
    const assertions = mirror.assertions()
    const local = this.config().contextSource === 'local'
    const search = query.search?.trim().toLowerCase()
    const nodes = local ? enrichNodes(mirror.nodes(), assertions) : mirror.nodes()
    const terms = nodes
      .filter((node) => (local ? !node.id.startsWith('auto:term:') : node.id.startsWith('auto:term:')))
      .map((node) => ({
        id: node.id,
        label: node.labels?.[0] ?? node.id,
        aliases: node.aliases ?? [],
        status: node.status ?? 'accepted',
        definition: node.definition,
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

  async getViewData(scope: OntoAgentScope, query: { viewTab?: string; search?: string; page?: number; pageSize?: number; status?: OntoAgentAnswerStatus }) {
    const contextSource = this.config().contextSource
    switch (query.viewTab) {
      case 'terms':
        return { ...(await this.listTerms(scope, query)), contextSource }
      case 'answers':
        return { ...(await this.listAnswers(scope, query)), contextSource }
      case 'transfers':
        return {
          ...(await this.listTransfers(scope, {
            status: query.status as OntoAgentTransfer['status'] | undefined,
            page: query.page,
            pageSize: query.pageSize
          })),
          contextSource
        }
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

/** 稳定摘要：用于 packet 去重与幂等 transferId（不引随机源）。 */
function digestOf(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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
