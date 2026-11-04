import { describe, expect, it } from 'vitest'
import { analysisInputSchema, confirmAnalysisSchema, markFailedSchema, retryAnalysisSchema, saveMatchResultSchema } from './schemas.js'

const analysisId = 'e7f6f8b1-0e84-4bca-8d12-9b2d4a8f6c11'

describe('untrusted workflow inputs', () => {
  it('rejects empty material before creating a record', () => {
    expect(analysisInputSchema.safeParse({
      candidateName: '测试候选人', jobTitle: '测试岗位', jobText: '', resumeText: ''
    }).success).toBe(false)
  })

  it('requires a current revision for retries', () => {
    expect(retryAnalysisSchema.safeParse({ analysisId }).success).toBe(false)
    expect(retryAnalysisSchema.parse({ analysisId, expectedRevision: 0 }).expectedRevision).toBe(0)
  })

  it.each([-1, 101, 5.5])('rejects invalid human score %s', (humanScore) => {
    expect(confirmAnalysisSchema.safeParse({
      analysisId, expectedRevision: 1, humanDecision: '进入人才库', humanScore, humanConclusion: '待补充材料'
    }).success).toBe(false)
  })

  it('rejects injected identity fields instead of accepting client scope', () => {
    expect(markFailedSchema.safeParse({
      analysisId, attempt: 1, reason: '输入不完整', tenantId: 'other-tenant'
    }).success).toBe(false)
  })

  it('requires a bounded nonempty failure reason', () => {
    expect(markFailedSchema.safeParse({ analysisId, attempt: 1, reason: '' }).success).toBe(false)
    expect(markFailedSchema.safeParse({ analysisId, attempt: 1, reason: 'x'.repeat(501) }).success).toBe(false)
  })

  it('accepts an honest no-match result without forcing fabricated evidence', () => {
    const result = saveMatchResultSchema.parse({
      analysisId, attempt: 1,
      skillsScore: 0, experienceScore: 0, domainScore: 0, educationScore: 0,
      skillsSummary: '原文没有体现岗位所需技能。', experienceSummary: '经历不匹配。',
      domainSummary: '没有行业经历证据。', educationSummary: '未提供相关材料。',
      matchedSkills: [], missingSkills: ['岗位要求的技能'], highlights: [], risks: ['需要补充材料。'],
      summary: '未找到明确匹配证据，需人工核实。', recommendation: '请补充材料。'
    })
    expect(result.matchedSkills).toEqual([])
    expect(result.highlights).toEqual([])
  })
})
