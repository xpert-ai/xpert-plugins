import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { DEGREE_RANK } from './types.js'
import type { CandidateFields, ResumeEvidence, ScoreState, ScoreHistoryEntry } from './types.js'
import type { ResumeCandidate } from './entities/resume-candidate.entity.js'
import type { ResumeScreening } from './entities/resume-screening.entity.js'
import type { ResumeScore } from './entities/resume-score.entity.js'

export function uniqueSkills(skills: string[]): string[] {
  const seen = new Set<string>()
  return skills.map((skill) => skill.trim()).filter((skill) => {
    const key = skill.toLocaleLowerCase('en-US')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function candidateFields(input: CandidateFields): CandidateFields {
  if (!input.name?.trim() || input.name.length > 200 || !input.resumeText?.trim() || input.resumeText.length > 20000
    || !Number.isInteger(input.yearsOfExperience) || input.yearsOfExperience < 0 || input.yearsOfExperience > 60
    || !Object.hasOwn(DEGREE_RANK, input.degree) || !Array.isArray(input.skills) || input.skills.length > 50
    || input.skills.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 100)) {
    throw new BadRequestException('Invalid candidate fields. Provide a name, resume evidence, valid years, degree and skills.')
  }
  return { name: input.name.trim(), yearsOfExperience: input.yearsOfExperience, degree: input.degree,
    skills: uniqueSkills(input.skills), resumeText: input.resumeText.trim() }
}

export function candidateEvidence(screening: ResumeScreening, candidate: ResumeCandidate): ResumeEvidence {
  const fields = { ...candidateFields(candidate), candidateRevision: candidate.revision ?? 1,
    jobTitle: screening.jobTitle, jdText: screening.jdText, minYears: screening.minYears,
    minDegree: screening.minDegree, requiredSkills: screening.requiredSkills }
  return { ...fields, version: createHash('sha256').update(JSON.stringify(fields)).digest('hex') }
}

export function scoreState(score: ResumeScore | null | undefined, evidence: ResumeEvidence): ScoreState {
  if (!score) return 'unscored'
  if ((score.candidateRevision ?? 1) !== evidence.candidateRevision) return 'stale'
  if (!score.evidenceVersion) return 'unverified'
  return score.evidenceVersion === evidence.version ? 'current' : 'stale'
}

export function scoreHistoryEntry(score: ResumeScore): ScoreHistoryEntry {
  return { scoredAt: score.scoredAt?.toISOString() ?? null,
    dimensions: score.dimensions, totalScore: score.totalScore, adjustedTotal: score.adjustedTotal,
    decision: score.decision, note: score.note, revision: score.revision ?? 1, evidence: score.evidence }
}
