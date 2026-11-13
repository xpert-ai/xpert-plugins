import { CASE_STATUSES, FAILURE_CODES } from '../../../domain/case'
import type { CaseDetail, CaseStatus, CaseSummary, CategorySuggestion, FailureCode } from '../../../domain/case'
import { isRecord } from './bridge'
import { z } from 'zod/v3'
import { runDetailSchema, runSummarySchema } from '../../../domain/evaluation'
import type { EvaluationRunDetail, EvaluationRunSummary } from '../../../domain/evaluation'

export interface CategoryView {
  id: string
  label: Record<string, string>
  definition: string
}

export interface WorkbenchData {
  cases: CaseSummary[]
  categories: CategoryView[]
  selected: CaseDetail | null
  runs: { items: EvaluationRunSummary[]; total: number; page: number }
  run: EvaluationRunDetail | null
}

function isCaseStatus(value: unknown): value is CaseStatus {
  return CASE_STATUSES.some(status => status === value)
}

function isFailureCode(value: unknown): value is FailureCode {
  return FAILURE_CODES.some(code => code === value)
}

function fail(): never {
  throw new Error('unexpected_response')
}

function parseSummary(entry: unknown): CaseSummary {
  if (
    !isRecord(entry)
    || typeof entry.id !== 'string'
    || typeof entry.title !== 'string'
    || !isCaseStatus(entry.status)
    || typeof entry.revision !== 'number'
    || typeof entry.canAnalyze !== 'boolean'
    || typeof entry.createdAt !== 'string'
    || typeof entry.updatedAt !== 'string'
  ) fail()
  return {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    revision: entry.revision,
    canAnalyze: entry.canAnalyze,
    confirmedCategoryId: typeof entry.confirmedCategoryId === 'string' ? entry.confirmedCategoryId : null,
    referenceCategoryId: typeof entry.referenceCategoryId === 'string' ? entry.referenceCategoryId : null,
    failureCode: isFailureCode(entry.failureCode) ? entry.failureCode : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }
}

function parseSuggestion(entry: unknown): CategorySuggestion {
  if (
    !isRecord(entry)
    || typeof entry.categoryId !== 'string'
    || typeof entry.confidence !== 'number'
    || typeof entry.reason !== 'string'
  ) fail()
  return { categoryId: entry.categoryId, confidence: entry.confidence, reason: entry.reason }
}

function parseCategory(entry: unknown): CategoryView {
  if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.definition !== 'string' || !isRecord(entry.label)) fail()
  const label: Record<string, string> = {}
  for (const [key, value] of Object.entries(entry.label)) if (typeof value === 'string') label[key] = value
  return { id: entry.id, label, definition: entry.definition }
}

function parseDetail(entry: unknown): CaseDetail | null {
  if (entry === null || entry === undefined) return null
  if (!isRecord(entry) || !Array.isArray(entry.suggestions)) fail()
  const photo = entry.photoDataUrl
  if (photo !== null && (typeof photo !== 'string' || !photo.startsWith('data:image/'))) fail()
  return { ...parseSummary(entry), photoDataUrl: photo, suggestions: entry.suggestions.map(parseSuggestion) }
}

/** The view never trusts the shape of host data; anything unexpected is a load failure. */
export function parseWorkbenchData(item: unknown): WorkbenchData {
  if (!isRecord(item) || !Array.isArray(item.cases) || !Array.isArray(item.categories)) fail()
  return {
    cases: item.cases.map(parseSummary),
    categories: item.categories.map(parseCategory),
    selected: parseDetail(item.selected),
    runs: z.object({ items: z.array(runSummarySchema), total: z.number(), page: z.number() }).parse(item.runs),
    run: item.run ? runDetailSchema.parse(item.run) : null
  }
}

export function parseCreatedCase(value: unknown): CaseSummary {
  return parseSummary(value)
}
