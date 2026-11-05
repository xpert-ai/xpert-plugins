import { createHash, randomUUID } from 'node:crypto'
import {
  ConfirmCasesInput, DiscardCasesInput, PersistDraftInput, SaveRequirementInput,
  TestCaseError, WorkbenchState, scopeSchema, testCaseSchema, workbenchStateSchema
} from './contracts.js'
import type { TestCase, WorkspaceScope } from './contracts.js'

// A minimal persistence port so the business rules can run and be tested without the
// host framework. The production adapter stores this on the plugin database table.
export interface WorkbenchRow {
  tenantId: string; organizationId: string; workspaceId: string; userId: string; xpertId: string
  id: string; revision: number; payloadJson: string; updatedAt: string
}
export class UniqueViolationError extends Error { constructor() { super('unique_violation'); this.name = 'UniqueViolationError' } }
export interface WorkbenchStorePort {
  findByScope(scope: WorkspaceScope): Promise<WorkbenchRow | null>
  insert(row: WorkbenchRow): Promise<void>
  updateByRevision(scope: WorkspaceScope, expectedRevision: number, patch: { revision: number; payloadJson: string; updatedAt: string }): Promise<{ affected: number }>
}

const now = () => new Date().toISOString()
export function recordId(scope: WorkspaceScope) {
  const s = scopeSchema.parse(scope)
  return createHash('sha256')
    .update(JSON.stringify([s.tenantId, s.organizationId, s.workspaceId, s.userId, s.xpertId]))
    .digest('hex')
}

// All business rules live here: they decide what is saved, how conflicts surface, and how
// a retried generation stays idempotent. Nothing below imports the platform SDK or ORM.
export class WorkbenchStore {
  constructor(private readonly port: WorkbenchStorePort) {}

  private empty(): WorkbenchState { return { revision: 0, requirements: [], cases: [] } }

  async getState(scope: WorkspaceScope): Promise<WorkbenchState> {
    const row = await this.port.findByScope(scope)
    if (!row) return this.empty()
    const parsed = workbenchStateSchema.omit({ revision: true }).parse(JSON.parse(row.payloadJson))
    return { ...parsed, revision: row.revision }
  }

  private async write(scope: WorkspaceScope, next: WorkbenchState, expectedRevision: number) {
    const clean = scopeSchema.parse(scope)
    const updatedAt = now()
    const payloadJson = JSON.stringify({ requirements: next.requirements, cases: next.cases })
    if (expectedRevision === 0) {
      try { await this.port.insert({ ...clean, id: recordId(clean), revision: 1, payloadJson, updatedAt }) }
      catch (error) { if (error instanceof UniqueViolationError) throw new TestCaseError('conflict'); throw error }
      return { revision: 1 }
    }
    const { affected } = await this.port.updateByRevision(clean, expectedRevision, { revision: expectedRevision + 1, payloadJson, updatedAt })
    if (affected !== 1) throw new TestCaseError('conflict')
    return { revision: expectedRevision + 1 }
  }

  async saveRequirement(scope: WorkspaceScope, input: SaveRequirementInput) {
    const state = await this.getState(scope)
    const id = input.requirement.id ?? randomUUID()
    const existing = state.requirements.find(item => item.id === id)
    const title = input.requirement.title ?? existing?.title
    const description = input.requirement.description ?? existing?.description
    const moduleValue = input.requirement.module ?? existing?.module ?? ''
    if (!title || !description) throw new TestCaseError('invalid_input', 'title and description are required')
    const requirement = { id, title, description, module: moduleValue, createdAt: existing?.createdAt ?? now(), updatedAt: now() }
    const requirements = existing
      ? state.requirements.map(item => (item.id === id ? requirement : item))
      : [...state.requirements, requirement]
    const receipt = await this.write(scope, { ...state, requirements }, input.expectedRevision)
    return { revision: receipt.revision, requirement }
  }

  // Called by the assistant after it drafts cases. Idempotent per requestId so retrying a
  // failed generation never duplicates rows. Retries a revision conflict a bounded number of times.
  async persistDraft(scope: WorkspaceScope, input: PersistDraftInput, maxAttempts = 3) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const state = await this.getState(scope)
      if (!state.requirements.some(item => item.id === input.requirementId)) {
        throw new TestCaseError('not_found', 'requirement must be saved before generating cases')
      }
      const already = state.cases.filter(item => item.requestId === input.requestId)
      if (already.length) return { revision: state.revision, created: 0, reused: already.length, caseIds: already.map(item => item.id) }

      const timestamp = now()
      const drafts: TestCase[] = input.cases.map(item => testCaseSchema.parse({
        ...item, id: randomUUID(), requirementId: input.requirementId, status: 'draft',
        requestId: input.requestId, createdAt: timestamp, updatedAt: timestamp
      }))
      try {
        const receipt = await this.write(scope, { ...state, cases: [...state.cases, ...drafts] }, state.revision)
        return { revision: receipt.revision, created: drafts.length, reused: 0, caseIds: drafts.map(item => item.id) }
      } catch (error) {
        if (error instanceof TestCaseError && error.code === 'conflict' && attempt < maxAttempts - 1) continue
        throw error
      }
    }
    throw new TestCaseError('conflict')
  }

  async confirmCases(scope: WorkspaceScope, input: ConfirmCasesInput) {
    const state = await this.getState(scope)
    const set = new Set(input.caseIds)
    const missing = input.caseIds.filter(id => !state.cases.some(item => item.id === id))
    if (missing.length) throw new TestCaseError('not_found', missing.join(','))
    const timestamp = now()
    const cases = state.cases.map(item => (set.has(item.id) ? { ...item, status: 'confirmed' as const, updatedAt: timestamp } : item))
    const receipt = await this.write(scope, { ...state, cases }, input.expectedRevision)
    return { revision: receipt.revision, confirmed: input.caseIds.length }
  }

  async discardCases(scope: WorkspaceScope, input: DiscardCasesInput) {
    const state = await this.getState(scope)
    const set = new Set(input.caseIds)
    const missing = input.caseIds.filter(id => !state.cases.some(item => item.id === id))
    if (missing.length) throw new TestCaseError('not_found', missing.join(','))
    const cases = state.cases.filter(item => !set.has(item.id))
    const receipt = await this.write(scope, { ...state, cases }, input.expectedRevision)
    return { revision: receipt.revision, discarded: input.caseIds.length }
  }
}
