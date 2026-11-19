export type TestCasePriority = 'P0' | 'P1' | 'P2'
export type TestCaseGranularity = 'basic' | 'detailed'
export type AutomationFramework = 'playwright' | 'pytest' | 'postman'
export type BugSeverity = 'critical' | 'major' | 'minor'
export type BugStatus = 'open' | 'analyzed' | 'closed'

export interface TestCaseDataField {
  name: string
  valid: string[]
  invalid: string[]
  boundary: string[]
}

export interface TestCaseData {
  fields: TestCaseDataField[]
  notes?: string
}

export interface RequirementPoint {
  point: string
  covered: boolean
  relatedCaseNames: string[]
}

export interface ReviewIssue {
  type: 'duplicate' | 'missing' | 'priority' | 'other'
  description: string
  caseNames?: string[]
  suggestion?: string
}

export interface TestCaseReview {
  id?: string
  projectId?: string
  requirementText: string
  requirementPoints: RequirementPoint[]
  totalPoints: number
  coveredPoints: number
  coverageScore: number
  issues: ReviewIssue[]
  suggestedCases: TestCase[]
  summary: string
  createdAt?: Date
}

export interface AutomationScript {
  id?: string
  projectId?: string
  testCaseId?: string | null
  testCaseName?: string
  framework: AutomationFramework
  language: string
  filename: string
  content: string
  createdAt?: Date
}

export interface Bug {
  id?: string
  projectId?: string
  title: string
  description: string
  severity: BugSeverity
  status: BugStatus
  rootCause: string
  regressionCases: TestCase[]
  createdAt?: Date
}

export interface TestCaseScope {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface TestCase {
  id?: string
  name: string
  precondition: string
  steps: string[]
  expectedResult: string
  priority: TestCasePriority
  testData?: TestCaseData | null
  projectId?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface TestCaseProject {
  id?: string
  requirementText: string
  granularity: TestCaseGranularity
  testCases?: TestCase[]
  tenantId?: string
  organizationId?: string | null
  createdBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface TestCaseGenerateInput {
  requirementText: string
  granularity?: TestCaseGranularity
  testCases?: Array<{
    name: string
    precondition: string
    steps: string[]
    expectedResult: string
    priority: TestCasePriority
  }>
}

export interface TestCaseSaveProjectInput {
  requirementText: string
  granularity?: TestCaseGranularity
  testCases: Array<{
    name: string
    precondition: string
    steps: string[]
    expectedResult: string
    priority: TestCasePriority
  }>
}

export interface TestCaseUpdateInput {
  name?: string
  precondition?: string
  steps?: string[]
  expectedResult?: string
  priority?: TestCasePriority
}

export interface TestCaseProjectSummary {
  id: string
  requirementText: string
  granularity: TestCaseGranularity
  testCaseCount: number
  createdAt?: Date
  updatedAt?: Date
}

export type TestCaseErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'VALIDATION_ERROR'

export interface TestCaseGenerationError {
  code: TestCaseErrorCode
  message: string
}

export const TEST_CASE_REQUIREMENT_MIN_LENGTH = 20

export function isValidRequirementText(text: string | null | undefined): text is string {
  if (!text) return false
  const trimmed = text.trim()
  return trimmed.length >= TEST_CASE_REQUIREMENT_MIN_LENGTH
}

export function validateGeneratedTestCase(caseItem: unknown): caseItem is TestCase {
  if (!caseItem || typeof caseItem !== 'object') return false
  const item = caseItem as Record<string, unknown>
  return (
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    typeof item.precondition === 'string' &&
    typeof item.expectedResult === 'string' &&
    Array.isArray(item.steps) &&
    item.steps.length > 0 &&
    typeof item.priority === 'string' &&
    ['P0', 'P1', 'P2'].includes(item.priority)
  )
}

export function normalizeTestCaseSteps(steps: unknown): string[] {
  if (!Array.isArray(steps)) return []
  return steps
    .map((step) => (typeof step === 'string' ? step.trim() : String(step ?? '').trim()))
    .filter(Boolean)
}

export function validateTestCaseData(data: unknown): TestCaseData | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.fields)) return null
  const fields = obj.fields
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
    .map((f) => ({
      name: typeof f.name === 'string' ? f.name.trim() : '',
      valid: Array.isArray(f.valid) ? f.valid.filter((x): x is string => typeof x === 'string') : [],
      invalid: Array.isArray(f.invalid) ? f.invalid.filter((x): x is string => typeof x === 'string') : [],
      boundary: Array.isArray(f.boundary) ? f.boundary.filter((x): x is string => typeof x === 'string') : []
    }))
    .filter((f) => f.name)
  if (!fields.length) return null
  return {
    fields,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined
  }
}

export function validateRequirementPoint(point: unknown): RequirementPoint | null {
  if (!point || typeof point !== 'object') return null
  const obj = point as Record<string, unknown>
  if (typeof obj.point !== 'string' || !obj.point.trim()) return null
  return {
    point: obj.point.trim(),
    covered: obj.covered === true,
    relatedCaseNames: Array.isArray(obj.relatedCaseNames)
      ? obj.relatedCaseNames.filter((x): x is string => typeof x === 'string')
      : []
  }
}

export function validateReviewIssue(issue: unknown): ReviewIssue | null {
  if (!issue || typeof issue !== 'object') return null
  const obj = issue as Record<string, unknown>
  const type = ['duplicate', 'missing', 'priority', 'other'].includes(obj.type as string)
    ? (obj.type as ReviewIssue['type'])
    : 'other'
  if (typeof obj.description !== 'string' || !obj.description.trim()) return null
  return {
    type,
    description: obj.description.trim(),
    caseNames: Array.isArray(obj.caseNames)
      ? obj.caseNames.filter((x): x is string => typeof x === 'string')
      : undefined,
    suggestion: typeof obj.suggestion === 'string' ? obj.suggestion : undefined
  }
}

export function validateAutomationFramework(value: unknown): AutomationFramework | null {
  return ['playwright', 'pytest', 'postman'].includes(value as string) ? (value as AutomationFramework) : null
}

export function validateBugSeverity(value: unknown): BugSeverity {
  return ['critical', 'major', 'minor'].includes(value as string) ? (value as BugSeverity) : 'major'
}
