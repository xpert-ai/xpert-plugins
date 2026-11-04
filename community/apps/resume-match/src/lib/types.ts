export type AnalysisStatus = 'waiting_ai' | 'review' | 'confirmed' | 'failed'

export type MatchLevel = '高度匹配' | '较好匹配' | '基本匹配' | '匹配度较低'

export type HumanDecision = '进入面试' | '进入人才库' | '暂不匹配'

export interface MatchScope {
  tenantId: string
  organizationId: string
  userId: string
  assistantId?: string
  conversationId?: string
}

export interface DimensionScore {
  key: 'skills' | 'experience' | 'domain' | 'education'
  label: string
  score: number
  summary: string
}

export interface SkillScore {
  name: string
  score: number
}

export interface MatchResult {
  schemaVersion: 1
  overallScore: number
  level: MatchLevel
  dimensions: DimensionScore[]
  matchedSkills: SkillScore[]
  missingSkills: string[]
  highlights: string[]
  risks: string[]
  summary: string
  recommendation: string
}

export interface AnalysisInput {
  candidateName: string
  candidateTitle?: string
  candidateYears?: number
  candidateCity?: string
  candidatePhone?: string
  candidateEmail?: string
  jobTitle: string
  company?: string
  jobCity?: string
  salary?: string
  jobText: string
  resumeText: string
}

export interface SaveMatchResultInput {
  analysisId: string
  attempt: number
  skillsScore: number
  experienceScore: number
  domainScore: number
  educationScore: number
  skillsSummary: string
  experienceSummary: string
  domainSummary: string
  educationSummary: string
  matchedSkills: SkillScore[]
  missingSkills: string[]
  highlights: string[]
  risks: string[]
  summary: string
  recommendation: string
}

export interface ConfirmAnalysisInput {
  analysisId: string
  expectedRevision: number
  humanDecision: HumanDecision
  humanScore: number
  humanConclusion: string
}

export interface AnalysisSummary {
  id: string
  candidateName: string
  candidateTitle?: string
  candidateYears?: number
  jobTitle: string
  company?: string
  jobCity?: string
  salary?: string
  status: AnalysisStatus
  score?: number
  level?: MatchLevel
  revision: number
  attempt: number
  updatedAt: string
  createdAt: string
}

export interface AnalysisDetail extends AnalysisSummary {
  candidateCity?: string
  candidatePhone?: string
  candidateEmail?: string
  jobText: string
  resumeText: string
  result?: MatchResult
  humanDecision?: HumanDecision
  humanScore?: number
  humanConclusion?: string
  reviewedAt?: string
  errorMessage?: string
}

export interface ResumeMatchViewData {
  items: AnalysisSummary[]
  selected: AnalysisDetail | null
  total: number
  query: {
    page: number
    pageSize: number
  }
}

export type ViewActionKey =
  | 'prepare_analysis'
  | 'retry_analysis'
  | 'confirm_analysis'
  | 'refresh'
