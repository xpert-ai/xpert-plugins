export type ResumeScreeningJobStatus = 'draft' | 'ready' | 'analyzing' | 'reviewing' | 'completed'
export type CandidateScreeningStatus = 'pending' | 'analyzing' | 'completed' | 'failed'
export type ReviewerDecision = 'interview' | 'hold' | 'reject'
export type MatchRecommendation = 'interview' | 'hold' | 'reject'

export type ResumeScreeningScope = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  conversationId?: string | null
  assistantId?: string | null
}

export type ExtractedResume = {
  candidateName?: string
  phone?: string
  email?: string
  yearsExperience?: number
  education?: string
  skills?: string[]
  workExperiences?: string[]
  projectHighlights?: string[]
  summary?: string
  warnings?: string[]
}

export type MatchResult = {
  score: number
  recommendation: MatchRecommendation
  matchedPoints?: string[]
  missingRequirements?: string[]
  riskFlags?: string[]
  interviewQuestions?: string[]
  reason?: string
}

export type CreateScreeningJobInput = {
  title: string
  jd: string
  mustHaveSkills?: string[]
  niceToHaveSkills?: string[]
  minYearsExperience?: number
  screeningNotes?: string
  xpertId?: string
  agentKey?: string
}

export type AddCandidateInput = {
  jobId: string
  sourceName: string
  rawText: string
}

export type SaveResumeExtractionInput = {
  jobId: string
  candidateId: string
  extracted: ExtractedResume
}

export type SaveMatchResultInput = {
  jobId: string
  candidateId: string
  matchResult: MatchResult
}

export type UpdateReviewerDecisionInput = {
  jobId: string
  candidateId: string
  reviewerDecision?: ReviewerDecision
  reviewerScore?: number
  reviewerNote?: string
  summaryOverride?: string
}

export type ReportResumeAnalysisFailureInput = {
  jobId: string
  candidateId: string
  errorMessage: string
}

export type ResumeScreeningWorkbenchQuery = {
  jobId?: string
  search?: string
  page?: number
  pageSize?: number
}

export type ResumeScreeningAssistantChatCommand = {
  commandKey: 'assistant.chat.send_message'
  payload: {
    text: string
    clientMessageId?: string
    state?: Record<string, unknown>
  }
  jobId: string
  candidateId?: string
  role: 'resume_analysis' | 'batch_resume_analysis'
}
