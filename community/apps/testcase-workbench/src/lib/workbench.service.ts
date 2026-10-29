import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type DeepPartial } from 'typeorm'
import { WorkbenchRecord } from './workbench.entity.js'
import { UniqueViolationError, WorkbenchStore, type WorkbenchRow, type WorkbenchStorePort } from './domain/workbench-store.js'
import {
  ConfirmCasesInput, DiscardCasesInput, PersistDraftInput, SaveRequirementInput,
  WorkbenchState, scopeSchema
} from './domain/contracts.js'
import type { WorkspaceScope } from './domain/contracts.js'

// Production persistence port: the plugin database table, with the full scope as the key.
class TypeOrmWorkbenchPort implements WorkbenchStorePort {
  constructor(private readonly records: Repository<WorkbenchRecord>) {}
  async findByScope(scope: WorkspaceScope): Promise<WorkbenchRow | null> {
    const found = await this.records.findOneBy(scopeSchema.parse(scope))
    return found ? (found as unknown as WorkbenchRow) : null
  }
  async insert(row: WorkbenchRow) {
    try { await this.records.insert(row as unknown as DeepPartial<WorkbenchRecord>) }
    catch (error) { if (isUniqueViolation(error)) throw new UniqueViolationError(); throw error }
  }
  async updateByRevision(scope: WorkspaceScope, expectedRevision: number, patch: { revision: number; payloadJson: string; updatedAt: string }) {
    const result = await this.records.update({ ...scopeSchema.parse(scope), revision: expectedRevision }, patch)
    return { affected: result.affected ?? 0 }
  }
}

@Injectable()
export class TestCaseWorkbenchService {
  private readonly store: WorkbenchStore
  constructor(@InjectRepository(WorkbenchRecord) records: Repository<WorkbenchRecord>) {
    this.store = new WorkbenchStore(new TypeOrmWorkbenchPort(records))
  }
  getState(scope: WorkspaceScope): Promise<WorkbenchState> { return this.store.getState(scope) }
  saveRequirement(scope: WorkspaceScope, input: SaveRequirementInput) { return this.store.saveRequirement(scope, input) }
  persistDraft(scope: WorkspaceScope, input: PersistDraftInput) { return this.store.persistDraft(scope, input) }
  confirmCases(scope: WorkspaceScope, input: ConfirmCasesInput) { return this.store.confirmCases(scope, input) }
  discardCases(scope: WorkspaceScope, input: DiscardCasesInput) { return this.store.discardCases(scope, input) }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')) return true
  return error instanceof Error && /^UNIQUE constraint failed: plugin_testcase_workbench_record\./.test(error.message)
}
