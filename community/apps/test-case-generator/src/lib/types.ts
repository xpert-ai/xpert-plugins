export type TestCasePriority = 'P0' | 'P1' | 'P2'
export type TestCaseGranularity = 'basic' | 'detailed'

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
