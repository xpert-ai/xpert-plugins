// Prescreen rule boundaries: R-01 years, R-02 degree, R-03 missing skills.
// All data is fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { prescreenCandidate, suggestDecision, validateDimensions } from '../dist/lib/resume-screening.service.js'
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

test('all missing required skills merge into one R-03 warning listing every skill', () => {
  const findings = prescreenCandidate(JD, CANDIDATES.junior)
  const missing = findings.filter((finding) => finding.rule === 'R-03')
  assert.equal(missing.length, 1)
  assert.equal(missing[0].severity, 'warning')
  assert.match(missing[0].message, /Spring Boot/)
  assert.match(missing[0].message, /MySQL/)
})

test('skill aliases match: spring-boot / SpringBoot / Spring all satisfy Spring Boot', () => {
  for (const spelling of ['spring-boot', 'SpringBoot', 'Spring', 'Spring Framework']) {
    const findings = prescreenCandidate(JD, {
      ...CANDIDATES.senior,
      skills: ['Java', spelling, 'MySQL']
    })
    assert.deepEqual(
      findings.filter((finding) => finding.rule === 'R-03'),
      [],
      `spelling ${spelling} should satisfy the Spring Boot requirement`
    )
  }
})

test('near-miss: SQL for MySQL stays an R-03 warning and flags manual review', () => {
  const findings = prescreenCandidate(JD, {
    ...CANDIDATES.senior,
    skills: ['Java', 'SQL']
  })
  const missing = findings.filter((finding) => finding.rule === 'R-03')
  assert.equal(missing.length, 1)
  assert.match(missing[0].message, /Spring Boot/)
  assert.match(missing[0].message, /MySQL/)
  assert.match(missing[0].message, /SQL/)
  assert.match(missing[0].message, /verify manually/)
})

test('suggestDecision: thresholds, error cap, and unscored', () => {
  assert.equal(suggestDecision(72, false), 'interview')
  assert.equal(suggestDecision(72, true), 'pending')
  assert.equal(suggestDecision(64, false), 'pending')
  assert.equal(suggestDecision(50, false), 'pending')
  assert.equal(suggestDecision(49, false), 'rejected')
  assert.equal(suggestDecision(null, false), null)
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
