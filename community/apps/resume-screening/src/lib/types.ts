export type ResumeScreeningStatus = 'draft' | 'prescreened' | 'scored' | 'reviewing' | 'completed' | 'failed'

import type { XpertViewDataResult } from '@xpert-ai/contracts'

export type ResumeDecision = 'interview' | 'pending' | 'rejected'

export type ResumeDegreeLevel = 'high_school' | 'associate' | 'bachelor' | 'master' | 'doctorate'

/** Degree ordering used by the deterministic prescreen (R-02). Higher wins. */
export const DEGREE_RANK: Record<ResumeDegreeLevel, number> = {
  high_school: 1,
  associate: 2,
  bachelor: 3,
  master: 4,
  doctorate: 5
}

export type PrescreenFindingSeverity = 'error' | 'warning'

export interface PrescreenFinding {
  rule: string
  severity: PrescreenFindingSeverity
  message: string
  /** Short verbatim excerpt from the resume text that triggered the rule. */
  evidence?: string
}

export type ScoreDimensionKey = 'experience' | 'skills' | 'project_relevance' | 'stability' | 'bonus'

export const SCORE_DIMENSIONS: Array<{ key: ScoreDimensionKey; label: string; max: number }> = [
  { key: 'experience', label: 'Experience match', max: 20 },
  { key: 'skills', label: 'Skills match', max: 20 },
  { key: 'project_relevance', label: 'Project relevance', max: 20 },
  { key: 'stability', label: 'Stability', max: 20 },
  { key: 'bonus', label: 'Bonus', max: 20 }
]

export interface ScoreDimensionInput {
  dimension: ScoreDimensionKey
  score: number
  reason: string
}

export interface ResumeScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CreateScreeningInput {
  title: string
  jobTitle: string
  jdText: string
  minYears: number
  minDegree: ResumeDegreeLevel
  requiredSkills: string[]
  xpertId?: string
  agentKey?: string
}

export interface AddCandidateInput {
  screeningId: string
  name: string
  yearsOfExperience: number
  degree: ResumeDegreeLevel
  skills: string[]
  resumeText: string
}

export interface PrescreenResumeInput {
  screeningId: string
  candidateId: string
}

export interface ScoreResumeInput {
  screeningId: string
  candidateId: string
  /** Idempotency key supplied by the caller. Retrying the same operationId returns the stored receipt. */
  operationId?: string
  dimensions: ScoreDimensionInput[]
}

export interface ConfirmScreeningInput {
  screeningId: string
  candidateId: string
  decision: ResumeDecision
  /** Optional human-adjusted total score. When omitted the stored AI total stands. */
  adjustedTotal?: number
  note?: string
  /** Compare-and-swap token from the last read. Mismatch returns a revision conflict. */
  baseRevision?: number
}

export interface ScoreReceipt {
  screeningId: string
  candidateId: string
  scoreId: string
  totalScore: number
  revision: number
  /** True when this call returned a previously stored receipt instead of writing again. */
  duplicate: boolean
  status: string
  message: string
}

export interface ResumeWorkbenchQuery {
  screeningId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface CandidateRow {
  candidateId: string
  name: string
  yearsOfExperience: number
  degree: ResumeDegreeLevel
  skills: string[]
  prescreen: PrescreenFinding[]
  totalScore: number | null
  decision: ResumeDecision | null
  note: string | null
  revision: number
}

export interface ResumeWorkbenchSummary {
  screeningId: string | null
  title: string | null
  jobTitle: string | null
  status: ResumeScreeningStatus | null
  page: number
  pageSize: number
}

/** Paged Workbench read in the platform's flat XpertViewDataResult shape. */
export type ResumeWorkbenchData = XpertViewDataResult<CandidateRow, ResumeWorkbenchSummary>
