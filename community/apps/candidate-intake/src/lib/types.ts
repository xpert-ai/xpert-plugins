export type ApplicationStatus =
  | 'invited'
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'pending_review'
  | 'confirmed'
  | 'parse_failed'
  | 'screening_failed'
  | 'expired'

export type CandidateIdentity = 'intern_student' | 'fresh_graduate' | 'experienced'
export type WorkYears = 'none' | 'lt_1' | '1_3' | '3_5' | '5_10' | '10_plus'
export type MatchStatus = 'met' | 'partially_met' | 'not_evidenced'
export type HrDecision = 'advance' | 'request_information' | 'reject'

export interface EducationEntry {
  id: string
  degree: string
  school: string
  major: string
  startDate?: string
  endDate?: string
}

export interface ExperienceEntry {
  id: string
  company: string
  title: string
  startDate?: string
  endDate?: string
  description?: string
}

export interface ProjectEntry {
  id: string
  name: string
  role?: string
  description?: string
}

export interface CandidateProfile {
  name?: string
  phone?: string
  email?: string
  currentCity?: string
  identity?: CandidateIdentity
  workYears?: WorkYears
  earliestAvailability?: string
  highestDegree?: string
  education: EducationEntry[]
  skills: string[]
  abilitySummary?: string
  experiences: ExperienceEntry[]
  projects: ProjectEntry[]
  certificates: string[]
  portfolioUrl?: string
  answers: Record<string, string>
}

export interface ScreeningFinding {
  criterion: string
  status: MatchStatus
  evidence?: string
  explanation: string
}

export interface ScreeningResult {
  summary: string
  requiredFindings: ScreeningFinding[]
  preferredFindings: ScreeningFinding[]
  strengths: string[]
  concerns: string[]
  followUpQuestions: string[]
  generatedAt: string
}

export interface CandidateScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  workspaceId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface JobQuestion {
  id: string
  label: string
  required: boolean
}
