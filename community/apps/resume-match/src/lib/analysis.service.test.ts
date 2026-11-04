import 'reflect-metadata'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`
}))

import { ResumeMatchService, buildMatchResult, weightedScore } from './analysis.service.js'
import { ResumeMatchAnalysisEntity } from './entities/resume-match-analysis.entity.js'
import type { MatchScope, SaveMatchResultInput } from './types.js'

const scope: MatchScope = {
  tenantId: 'tenant-test', organizationId: 'organization-test', userId: 'user-test'
}
const analysisId = 'e7f6f8b1-0e84-4bca-8d12-9b2d4a8f6c11'
const resultInput: SaveMatchResultInput = {
  analysisId, attempt: 1,
  skillsScore: 80, experienceScore: 60, domainScore: 40, educationScore: 20,
  skillsSummary: '简历列出 TypeScript 项目。',
  experienceSummary: '简历体现后端开发经验。',
  domainSummary: '行业经历需要核实。',
  educationSummary: '学历材料需要核实。',
  matchedSkills: [{ name: 'TypeScript', score: 80 }],
  missingSkills: [], highlights: ['有 TypeScript 项目证据。'], risks: ['需核实职责范围。'],
  summary: '部分能力有证据，其他信息待核实。', recommendation: '请人工核实项目细节。'
}

function fixture(overrides: Partial<ResumeMatchAnalysisEntity> = {}) {
  // This DataSource is never initialized: repository spies isolate business rules from PostgreSQL.
  const dataSource = new DataSource({ type: 'postgres' })
  const repository = dataSource.getRepository(ResumeMatchAnalysisEntity)
  const entity = Object.assign(new ResumeMatchAnalysisEntity(), {
    id: analysisId, ...scope, candidateName: '示例候选人', jobTitle: '后端工程师',
    jobText: '岗位说明测试文本', resumeText: '简历测试文本',
    status: 'waiting_ai', revision: 0, attempt: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  })
  const find = vi.spyOn(repository, 'findOne').mockResolvedValue(entity)
  const update = vi.spyOn(repository, 'update').mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })
  const save = vi.spyOn(repository, 'save')
  return { entity, find, update, save, service: new ResumeMatchService(repository) }
}

afterEach(() => vi.restoreAllMocks())

describe('review workflow', () => {
  it('calculates a deterministic score and preserves evidence for review', () => {
    expect(weightedScore(resultInput)).toBe(63)
    const result = buildMatchResult(resultInput)
    expect(result.level).toBe('基本匹配')
    expect(result.highlights).toEqual(resultInput.highlights)
    expect(result.dimensions).toHaveLength(4)
  })

  it('rejects a late AI result from an older attempt without writing', async () => {
    const { service, update } = fixture({ attempt: 2 })
    await expect(service.saveResult(scope, resultInput)).rejects.toBeInstanceOf(ConflictException)
    expect(update).not.toHaveBeenCalled()
  })

  it('never lets the model overwrite a confirmed human decision', async () => {
    const { service, update } = fixture({ status: 'confirmed' })
    await expect(service.saveResult(scope, resultInput)).rejects.toBeInstanceOf(BadRequestException)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns the existing draft when the same successful tool call is retried', async () => {
    const { service, update } = fixture({ status: 'review', revision: 1, result: buildMatchResult(resultInput) })
    const result = await service.saveResult(scope, resultInput)
    expect(result.id).toBe(analysisId)
    expect(result.revision).toBe(1)
    expect(update).not.toHaveBeenCalled()
  })

  it('retries in the same record with a guarded revision and attempt', async () => {
    const { service, entity, find, update, save } = fixture({ status: 'failed', revision: 2 })
    find.mockResolvedValueOnce(entity).mockResolvedValueOnce(Object.assign(new ResumeMatchAnalysisEntity(), entity, {
      attempt: 2, revision: 3, status: 'waiting_ai'
    }))
    const result = await service.prepareRetry(scope, analysisId, 2)
    expect(result).toMatchObject({ id: analysisId, attempt: 2, revision: 3, status: 'waiting_ai' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: analysisId, ...scope, revision: 2, attempt: 1
    }), expect.objectContaining({ attempt: 2, revision: 3 }))
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a second retry prepared from an obsolete page revision', async () => {
    const { service, update } = fixture({ revision: 3, attempt: 2 })
    await expect(service.prepareRetry(scope, analysisId, 2)).rejects.toBeInstanceOf(ConflictException)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not reopen a record confirmed concurrently with retry', async () => {
    const { service, update, save } = fixture({ revision: 2 })
    update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
    await expect(service.prepareRetry(scope, analysisId, 2)).rejects.toBeInstanceOf(ConflictException)
    expect(save).not.toHaveBeenCalled()
  })

  it('requires an AI draft before human confirmation', async () => {
    const { service, update } = fixture()
    await expect(service.confirm(scope, {
      analysisId, expectedRevision: 0, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '待补充材料'
    })).rejects.toBeInstanceOf(BadRequestException)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns the same result for a repeated identical confirmation', async () => {
    const { service, update } = fixture({
      status: 'confirmed', revision: 2, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '待补充材料'
    })
    const result = await service.confirm(scope, {
      analysisId, expectedRevision: 1, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '待补充材料'
    })
    expect(result).toMatchObject({ id: analysisId, revision: 2, status: 'confirmed' })
    expect(update).not.toHaveBeenCalled()
  })

  it('prevents an obsolete request from changing a confirmed conclusion', async () => {
    const { service, update } = fixture({ status: 'confirmed', revision: 2, humanConclusion: '原结论' })
    await expect(service.confirm(scope, {
      analysisId, expectedRevision: 1, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '另一个结论'
    })).rejects.toBeInstanceOf(ConflictException)
    expect(update).not.toHaveBeenCalled()
  })

  it('allows an explicit human revision with the current version', async () => {
    const { service, update } = fixture({ status: 'confirmed', revision: 2 })
    await service.confirm(scope, {
      analysisId, expectedRevision: 2, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '修订后的人工结论'
    })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: analysisId, ...scope, revision: 2 }),
      expect.objectContaining({ status: 'confirmed', humanConclusion: '修订后的人工结论', revision: 3 }))
  })

  it('rejects a concurrent human revision that loses the version race', async () => {
    const { service, update } = fixture({ status: 'confirmed', revision: 2 })
    update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
    await expect(service.confirm(scope, {
      analysisId, expectedRevision: 2, humanDecision: '进入人才库', humanScore: 60, humanConclusion: '修订后的人工结论'
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('scopes reads to the authenticated user, organization and tenant', async () => {
    const { service, find, update } = fixture()
    find.mockResolvedValueOnce(null)
    await expect(service.readForAssistant(scope, analysisId)).rejects.toBeInstanceOf(NotFoundException)
    expect(find).toHaveBeenCalledWith({ where: { id: analysisId, ...scope } })
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps confirmed human data intact when a late failure arrives', async () => {
    const { service, update } = fixture({ status: 'confirmed' })
    await expect(service.markFailed(scope, analysisId, 1, '模型超时')).rejects.toBeInstanceOf(BadRequestException)
    expect(update).not.toHaveBeenCalled()
  })
})
