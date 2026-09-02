import { describe, expect, it, vi } from 'vitest'

vi.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))

import type { FactoryScope } from './domain/types.js'
import type { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'

const scope: FactoryScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'creator-1',
  assistantId: 'orchestrator-1',
  actorType: 'user'
}

describe('FactoryCaseProjectService', () => {
  it('reuses the persisted Project id across a failed synchronization retry', async () => {
    const entity = buildCase()
    const ensure = vi.fn()
      .mockRejectedValueOnce(new Error('assistant_binding_missing'))
      .mockResolvedValueOnce({
        projectId: entity.workspaceProjectId,
        xpertIds: ['orchestrator-1'],
        operation: 'created'
      })
    const repository = buildRepository(entity)
    const service = new FactoryCaseProjectService(
      repository as never,
      { require: () => ({ ensure }) } as never
    )

    const failed = await service.synchronize(scope, entity)
    expect(failed.workspaceProjectSyncStatus).toBe('failed')
    expect(failed.workspaceProjectErrorCode).toBe('assistant_binding_missing')

    const ready = await service.retry(scope, entity.id)
    expect(ready.workspaceProjectSyncStatus).toBe('ready')
    expect(ensure).toHaveBeenCalledTimes(2)
    expect(ensure.mock.calls.map(([input]) => input.projectId)).toEqual([
      entity.workspaceProjectId,
      entity.workspaceProjectId
    ])
    expect(ensure.mock.calls[1]?.[0].externalAssistantExpectations).toHaveLength(8)
  })

  it('allows only the original Case creator to retry Project synchronization', async () => {
    const entity = buildCase()
    const service = new FactoryCaseProjectService(
      buildRepository(entity) as never,
      { require: () => ({ ensure: vi.fn() }) } as never
    )

    await expect(
      service.retry({ ...scope, userId: 'other-user' }, entity.id)
    ).rejects.toMatchObject({ status: 403 })
  })
})

function buildRepository(entity: FactoryCaseEntity) {
  return {
    findOne: vi.fn(async () => entity),
    update: vi.fn(async (_id: string, patch: Partial<FactoryCaseEntity>) => {
      Object.assign(entity, patch)
      return { affected: 1 }
    })
  }
}

function buildCase(): FactoryCaseEntity {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    scopeKey: 'tenant-1:org-1',
    caseKey: 'FAC-260901-ABC123',
    creationOperationId: 'create-1',
    creationFingerprint: 'fingerprint',
    status: 'investigating',
    createdById: 'creator-1',
    workspaceProjectId: '22222222-2222-4222-8222-222222222222',
    workspaceProjectSyncStatus: 'provisioning',
    workspaceProjectSyncedAt: new Date(),
    workspaceProjectErrorCode: null,
    workspaceProjectErrorSummary: null,
    currentStage: 'triage-event',
    deviceId: 'M-07',
    revision: 1,
    snapshot: {
      id: '11111111-1111-4111-8111-111111111111',
      caseKey: 'FAC-260901-ABC123',
      templateKey: 'factory_anomaly_recovery',
      templateVersion: 3,
      revision: 1,
      status: 'investigating',
      currentStage: 'triage-event',
      event: { title: '主轴振动趋势异常' }
    } as FactoryCaseEntity['snapshot'],
    lastEditedById: 'creator-1',
    failureCode: null,
    failureMessage: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}
