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

export interface ScoreRubricBand {
  min: number
  max: number
  /** One-sentence anchor in English: what resume evidence earns this band. */
  anchor: string
}

/**
 * Scoring rubric: four bands per dimension. The model must score inside the
 * band that matches the resume evidence and must not inflate above it; the
 * same rubric is quoted in the resume_score tool description and the
 * assistant template, so the bands are the single source of truth here.
 */
export const SCORE_RUBRIC: Record<ScoreDimensionKey, ScoreRubricBand[]> = {
  experience: [
    { min: 16, max: 20, anchor: '8+ years of directly relevant experience, including leading a core module or system.' },
    { min: 11, max: 15, anchor: '5-8 years of relevant experience with clear ownership of a major feature.' },
    { min: 6, max: 10, anchor: '2-5 years of relevant experience, mostly in supporting roles.' },
    { min: 0, max: 5, anchor: 'Under 2 years of relevant experience, or experience unrelated to the JD.' }
  ],
  skills: [
    { min: 16, max: 20, anchor: 'All required skills present with project evidence in the resume.' },
    { min: 11, max: 15, anchor: 'Most required skills present with project evidence; one minor gap.' },
    { min: 6, max: 10, anchor: 'About half of the required skills present, or the evidence is thin.' },
    { min: 0, max: 5, anchor: 'Required skills mostly missing, or only mentioned without evidence.' }
  ],
  project_relevance: [
    { min: 16, max: 20, anchor: 'Led a core project in the same domain as the JD.' },
    { min: 11, max: 15, anchor: 'Contributed to a closely related project with a visible role.' },
    { min: 6, max: 10, anchor: 'Project experience in a loosely related domain.' },
    { min: 0, max: 5, anchor: 'No project in the JD domain.' }
  ],
  stability: [
    { min: 16, max: 20, anchor: 'Average tenure 4+ years, no short hops.' },
    { min: 11, max: 15, anchor: 'Average tenure 2-4 years, at most one short hop.' },
    { min: 6, max: 10, anchor: 'Average tenure 1-2 years, or two short hops.' },
    { min: 0, max: 5, anchor: 'Frequent job changes, average tenure under 1 year.' }
  ],
  bonus: [
    { min: 16, max: 20, anchor: 'A rare differentiator with evidence: open-source maintainership, a patent, or a domain certification.' },
    { min: 11, max: 15, anchor: 'One solid differentiator, e.g. a relevant certification or a notable side project.' },
    { min: 6, max: 10, anchor: 'A minor plus, e.g. a related tool or a secondary skill.' },
    { min: 0, max: 5, anchor: 'No bonus items.' }
  ]
}

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
  requestId?: string
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
  requestId?: string
  screeningId: string
  name: string
  yearsOfExperience: number
  degree: ResumeDegreeLevel
  skills: string[]
  resumeText: string
}

/** Shared edit contract; the version represents the saved editable fields. */
export interface ScreeningEditFields {
  title: string
  jobTitle: string
  jdText: string
  minYears: number
  minDegree: ResumeDegreeLevel
  requiredSkills: string[]
}

export interface ScreeningEditState extends ScreeningEditFields {
  version: string
  criteriaLocked: boolean
}

export interface UpdateScreeningInput extends ScreeningEditFields {
  screeningId: string
  baseVersion: string
}

export interface CandidateFields {
  name: string
  yearsOfExperience: number
  degree: ResumeDegreeLevel
  skills: string[]
  resumeText: string
}

export interface ResumeEvidence extends CandidateFields {
  candidateRevision: number
  jobTitle: string
  jdText: string
  minYears: number
  minDegree: ResumeDegreeLevel
  requiredSkills: string[]
  version: string
}

export type ScoreState = 'unscored' | 'current' | 'stale' | 'unverified'

export interface ScoreHistoryEntry {
  /** Actual AI score save time. Absent for legacy history that did not record it. */
  scoredAt?: string | null
  dimensions: ScoreDimensionInput[]
  totalScore: number
  adjustedTotal?: number | null
  decision?: ResumeDecision | null
  note?: string | null
  revision: number
  evidence?: ResumeEvidence | null
}

export interface CandidateDetail extends CandidateFields {
  candidateId: string
  screeningId: string
  revision: number
  scoreState: ScoreState
  evidence?: ResumeEvidence | null
  history: ScoreHistoryEntry[]
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
  /** undefined preserves the current adjustment; null restores the AI total. */
  adjustedTotal?: number | null
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
  adjustedTotal?: number | null
  decision: ResumeDecision | null
  /** System-suggested outcome from the total and prescreen findings. A suggestion only; a human can override it. Null when unscored. */
  suggestedDecision: ResumeDecision | null
  note: string | null
  revision: number
  dimensions: ScoreDimensionInput[]
  aiTotalScore: number | null
  scoreState?: ScoreState
  candidateRevision?: number
}

export interface ScreeningOption {
  id: string
  title: string
  jobTitle: string
}

export interface ScreeningListItem extends ScreeningOption {
  status: ResumeScreeningStatus
  candidateCount: number
  updatedAt: string | null
}

export interface ScreeningListSummary {
  kind: 'screening_list'
  page: number
  pageSize: number
}

export interface ResumeWorkbenchSummary {
  screeningId: string | null
  title: string | null
  jobTitle: string | null
  status: ResumeScreeningStatus | null
  page: number
  pageSize: number
  jdText?: string
  screenings?: ScreeningOption[]
  edit?: ScreeningEditState
}

/** Paged Workbench read in the platform's flat XpertViewDataResult shape. */
export type ResumeWorkbenchData = XpertViewDataResult<CandidateRow, ResumeWorkbenchSummary>
