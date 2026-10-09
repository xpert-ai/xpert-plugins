import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPluginConfigResolver, PLUGIN_CONFIG_RESOLVER_TOKEN } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { RELNOTE_PLUGIN_NAME } from './constants.js'
import { RelnotePluginConfig } from './relnote.config.js'
import { RelnoteAiRun, RelnoteRelease } from './entities/index.js'
import type { RelnoteRisk, RelnoteRollout, RelnoteScope, RelnoteStatus } from './types.js'

export interface CreateRelnoteDraftInput { deviceModel: string; version: string; changesRaw: string }
export interface SaveRelnoteNoteInput { releaseId: string; expectedRevision: number; noteMarkdown: string; risks: RelnoteRisk[]; rollout: RelnoteRollout }
export interface SaveRelnoteDraftInput extends CreateRelnoteDraftInput { releaseId: string; expectedRevision: number }
export interface ConfirmRelnoteReleaseInput { releaseId: string; expectedRevision: number; noteMarkdown?: string; risks?: RelnoteRisk[]; rollout?: RelnoteRollout }
export interface ListRelnoteReleasesInput { deviceModel?: string; status?: RelnoteStatus; limit?: number }

@Injectable()
export class RelnoteService {
  constructor(
    @InjectRepository(RelnoteRelease) private readonly releaseRepository: Repository<RelnoteRelease>,
    @InjectRepository(RelnoteAiRun) private readonly runRepository: Repository<RelnoteAiRun>,
    @Optional() @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN) private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  async createDraft(scope: RelnoteScope, input: CreateRelnoteDraftInput) {
    const deviceModel = requiredText(input.deviceModel, '目标机型')
    const version = requiredText(input.version, '版本号')
    const changesRaw = requiredText(input.changesRaw, '变更条目')
    const release = this.releaseRepository.create({
      ...this.scopedValues(scope), deviceModel, version, changesRaw, status: 'draft', revision: 0
    })
    return this.releaseRepository.save(release)
  }

  async listReleases(scope: RelnoteScope, input: ListRelnoteReleasesInput = {}) {
    const where = { ...this.scopedWhere(scope), ...(input.deviceModel ? { deviceModel: input.deviceModel.trim() } : {}), ...(input.status ? { status: input.status } : {}) }
    return this.releaseRepository.find({ where, order: { updatedAt: 'DESC' }, take: Math.min(Math.max(input.limit ?? 50, 1), 100) })
  }

  async getWorkbenchData(scope: RelnoteScope) {
    const releases = await this.listReleases(scope)
    const items = await Promise.all(releases.map(async (release) => ({
      ...release,
      runs: await this.runRepository.find({
        where: this.runScopedWhere(scope, release.id ?? ''),
        order: { attempt: 'DESC' }
      })
    })))
    return { items, total: items.length }
  }
  async getDraft(scope: RelnoteScope, releaseId: string) {
    const release = await this.findRelease(scope, releaseId)
    try {
      this.throwIfFailureInjected('read')
    } catch (error) {
      if (release.status === 'ai_running') {
        release.status = 'ai_failed'
        await this.releaseRepository.save(release)
        await this.markLatestRun(scope, releaseId, 'failed', errorMessage(error))
      }
      throw error
    }
    const runs = await this.runRepository.find({ where: this.runScopedWhere(scope, releaseId), order: { attempt: 'DESC' } })
    return {
      releaseId: release.id,
      deviceModel: release.deviceModel,
      version: release.version,
      changes: (release.changesRaw ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      revision: release.revision ?? 0,
      status: release.status,
      noteMarkdown: release.noteMarkdown,
      risks: release.risks ?? [],
      rollout: release.rollout,
      runs
    }
  }

  async saveDraft(scope: RelnoteScope, input: SaveRelnoteDraftInput) {
    const release = await this.findRelease(scope, input.releaseId)
    this.assertEditable(release)
    this.assertRevision(release, input.expectedRevision)
    const nextRevision = (release.revision ?? 0) + 1
    const result = await this.releaseRepository.update(
      { id: input.releaseId, ...this.scopedWhere(scope), revision: input.expectedRevision, status: release.status },
      { deviceModel: requiredText(input.deviceModel, '目标机型'), version: requiredText(input.version, '版本号'), changesRaw: requiredText(input.changesRaw, '变更条目'), revision: nextRevision }
    )
    if (result.affected !== 1) throw new Error('版本冲突：发布单已被其他操作更新，请先重新读取。')
    return this.findRelease(scope, input.releaseId)
  }

  async requestAi(scope: RelnoteScope, releaseId: string) {
    const release = await this.findRelease(scope, releaseId)
    if (release.status === 'confirmed') throw new Error('已归档的发布单只读，不能再次生成。')
    if (release.status === 'ai_running') throw new Error('AI 正在生成中，请勿重复触发。')
    const previousRuns = await this.runRepository.find({ where: this.runScopedWhere(scope, releaseId), order: { attempt: 'DESC' }, take: 1 })
    const run = await this.runRepository.save(this.runRepository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      releaseId,
      attempt: (previousRuns[0]?.attempt ?? 0) + 1,
      status: 'running'
    }))
    release.status = 'ai_running'
    await this.releaseRepository.save(release)
    return { runId: run.id, attempt: run.attempt, promptText: `请为发布单 ${releaseId} 生成发布说明和风险清单。` }
  }

  async retryAi(scope: RelnoteScope, releaseId: string) {
    const release = await this.findRelease(scope, releaseId)
    if (release.status !== 'ai_failed') throw new Error('只有 AI 失败的发布单可以重试。')
    return this.requestAi(scope, releaseId)
  }

  async saveNote(scope: RelnoteScope, input: SaveRelnoteNoteInput) {
    const release = await this.findRelease(scope, input.releaseId)
    this.assertRevision(release, input.expectedRevision)
    if (release.status !== 'ai_running') throw new Error(`发布单当前状态为 ${release.status}，不能保存 AI 结果。`)
    try {
      this.throwIfFailureInjected('save')
      const nextRevision = (release.revision ?? 0) + 1
      const result = await this.releaseRepository.update(
        { id: input.releaseId, ...this.scopedWhere(scope), revision: input.expectedRevision, status: 'ai_running' },
        { noteMarkdown: requiredText(input.noteMarkdown, '发布说明'), risks: input.risks ?? [], rollout: input.rollout, status: 'ai_done', revision: nextRevision }
      )
      if (result.affected !== 1) throw new Error('版本冲突：发布单已被其他操作更新，请先重新读取。')
      const saved = await this.findRelease(scope, input.releaseId)
      await this.markLatestRun(scope, input.releaseId, 'succeeded')
      return { ok: true, releaseId: saved.id, revision: saved.revision, status: saved.status }
    } catch (error) {
      // Never write the previously read entity back after a conditional write fails.
      // A newer result (or an already committed result with audit failure) must survive.
      const failed = await this.releaseRepository.update(
        { id: input.releaseId, ...this.scopedWhere(scope), revision: input.expectedRevision, status: 'ai_running' },
        { status: 'ai_failed' }
      )
      if (failed.affected === 1) {
        await this.markLatestRun(scope, input.releaseId, 'failed', errorMessage(error))
      }
      throw error
    }
  }

  async confirmRelease(scope: RelnoteScope, input: ConfirmRelnoteReleaseInput) {
    const release = await this.findRelease(scope, input.releaseId)
    if (release.status !== 'ai_done') throw new Error('只有已生成并待审核的发布单可以确认归档。')
    this.assertRevision(release, input.expectedRevision)
    const result = await this.releaseRepository.update(
      { id: input.releaseId, ...this.scopedWhere(scope), revision: input.expectedRevision, status: 'ai_done' },
      { noteMarkdown: input.noteMarkdown !== undefined ? requiredText(input.noteMarkdown, '发布说明') : release.noteMarkdown,
        risks: input.risks ?? release.risks, rollout: input.rollout ?? release.rollout,
        status: 'confirmed', revision: input.expectedRevision + 1 }
    )
    if (result.affected !== 1) throw new Error('版本冲突：发布单已被其他操作更新，请先重新读取。')
    return this.findRelease(scope, input.releaseId)
  }

  private async findRelease(scope: RelnoteScope, releaseId: string) {
    const release = await this.releaseRepository.findOne({ where: { id: releaseId, ...this.scopedWhere(scope) } })
    if (!release) throw new Error(`发布单不存在或不在当前数据范围内：${releaseId}`)
    return release
  }

  private async markLatestRun(scope: RelnoteScope, releaseId: string, status: 'succeeded' | 'failed', errorMessage?: string) {
    const [run] = await this.runRepository.find({ where: { ...this.runScopedWhere(scope, releaseId), status: 'running' }, order: { attempt: 'DESC' }, take: 1 })
    if (!run) return
    run.status = status
    run.finishedAt = new Date()
    run.errorMessage = errorMessage
    await this.runRepository.save(run)
  }

  private throwIfFailureInjected(kind: 'read' | 'save') {
    const configured = this.pluginConfigResolver?.resolve<RelnotePluginConfig>(RELNOTE_PLUGIN_NAME, { defaults: {} })
    if (configured?.failureInjection === kind) {
      throw new Error(kind === 'read' ? '模拟上游变更系统超时。' : '模拟持久化失败。')
    }
  }

  private assertEditable(release: RelnoteRelease) {
    if (release.status === 'confirmed') throw new Error('已归档的发布单只读。')
    if (release.status === 'ai_running') throw new Error('AI 正在生成中，不能编辑草稿。')
  }

  private assertRevision(release: RelnoteRelease, expectedRevision: number) {
    const current = release.revision ?? 0
    if (current !== expectedRevision) {
      throw new Error(`版本冲突：发布单当前版本 ${current}，你提交的是 ${expectedRevision}。请先用 relnote_get_draft 重新读取。`)
    }
  }

  private scopedValues(scope: RelnoteScope) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? undefined, assistantId: scope.assistantId }
  }

  private scopedWhere(scope: RelnoteScope) {
    return this.scopedValues(scope)
  }

  private runScopedWhere(scope: RelnoteScope, releaseId: string) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? undefined, releaseId }
  }
}

function requiredText(value: string | undefined, label: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`请填写${label}。`)
  return normalized
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}