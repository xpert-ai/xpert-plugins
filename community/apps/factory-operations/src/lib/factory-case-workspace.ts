import type { FactoryCaseSummary } from './domain/types.js'
import type { FactoryCaseEntity } from './entities/factory-case.entity.js'

export function projectFactoryWorkspace(
  entity: FactoryCaseEntity
): FactoryCaseSummary['workspace'] {
  return {
    projectId: entity.workspaceProjectId,
    status: entity.workspaceProjectSyncStatus,
    canLaunchTasks: entity.workspaceProjectSyncStatus === 'ready',
    errorCode: entity.workspaceProjectErrorCode ?? null
  }
}
