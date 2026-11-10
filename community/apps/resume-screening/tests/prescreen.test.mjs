// Prescreen rule boundaries: R-01 years, R-02 degree, R-03 missing skills.
// All data is fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { prescreenCandidate, validateDimensions } from '../dist/lib/resume-screening.service.js'
import { CANDIDATES, JD } from './fake-repo.mjs'

const rules = (findings) => findings.map((finding) => finding.rule)

test('candidate meeting every hard requirement passes with no findings', () => {
  assert.deepEqual(prescreenCandidate(JD, CANDIDATES.senior), [])
})

test('exactly at the years and degree thresholds passes (boundary, not below)', () => {
  assert.deepEqual(prescreenCandidate(JD, CANDIDATES.boundary), [])
})

test('fewer years than the minimum reports R-01 with the stated years', () => {
  const findings = prescreenCandidate(JD, CANDIDATES.junior)
  assert.ok(rules(findings).includes('R-01'))
  assert.equal(findings.find((finding) => finding.rule === 'R-01').severity, 'error')
  assert.match(findings.find((finding) => finding.rule === 'R-01').message, /3/)
})

test('degree below the minimum reports R-02', () => {
  const findings = prescreenCandidate(JD, CANDIDATES.associateDegree)
  assert.deepEqual(rules(findings), ['R-02'])
  assert.equal(findings[0].severity, 'error')
})

test('each missing required skill reports its own R-03 warning', () => {
  const findings = prescreenCandidate(JD, CANDIDATES.junior)
  const missing = findings.filter((finding) => finding.rule === 'R-03')
  assert.equal(missing.length, 2)
  assert.ok(missing.every((finding) => finding.severity === 'warning'))
  assert.ok(missing.some((finding) => finding.message.includes('Spring Boot')))
  assert.ok(missing.some((finding) => finding.message.includes('MySQL')))
})

test('findings carry a short evidence excerpt from the resume text', () => {
  const longResume = `背景介绍。${'工作经历描述。'.repeat(40)}3 年 Java 开发经验。`
  const findings = prescreenCandidate(JD, { ...CANDIDATES.junior, resumeText: longResume })
  const r01 = findings.find((finding) => finding.rule === 'R-01')
  assert.ok(r01.evidence)
  assert.ok(r01.evidence.length <= 201)
})

test('five dimensions of 0-20 sum to the total; out-of-range or duplicate dimensions are rejected', () => {
  assert.equal(validateDimensions([
    { dimension: 'experience', score: 16, reason: '经验匹配。' },
    { dimension: 'skills', score: 17, reason: '技能匹配。' },
    { dimension: 'project_relevance', score: 15, reason: '项目相关。' },
    { dimension: 'stability', score: 14, reason: '稳定性较好。' },
    { dimension: 'bonus', score: 10, reason: '有加分项。' }
  ]).totalScore, 72)
  assert.throws(
    () => validateDimensions([
      { dimension: 'experience', score: 21, reason: '超分。' },
      { dimension: 'skills', score: 17, reason: '技能匹配。' },
      { dimension: 'project_relevance', score: 15, reason: '项目相关。' },
      { dimension: 'stability', score: 14, reason: '稳定性较好。' },
      { dimension: 'bonus', score: 10, reason: '有加分项。' }
    ]),
    /between 0 and 20/
  )
  assert.throws(
    () => validateDimensions([
      { dimension: 'experience', score: 16, reason: '经验匹配。' },
      { dimension: 'experience', score: 16, reason: '重复维度。' },
      { dimension: 'project_relevance', score: 15, reason: '项目相关。' },
      { dimension: 'stability', score: 14, reason: '稳定性较好。' },
      { dimension: 'bonus', score: 10, reason: '有加分项。' }
    ]),
    /Duplicate score dimension/
  )
})
