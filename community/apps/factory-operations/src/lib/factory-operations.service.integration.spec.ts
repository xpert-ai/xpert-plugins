import { FactoryPipelineEvidence } from './pipeline/entity.js'
import { FACTORY_ROLE_ASSISTANTS } from './factory-assistant-definitions.js'
import { FACTORY_PLUGIN_NAME } from './constants.js'
import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { randomUUID } from 'node:crypto'
import { DataType, newDb } from 'pg-mem'
import type { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) =>
    `plugin_${namespace}_${tableKey}`,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  ProjectProvisioningRuntimeCapability: 'platform.project.provisioning',
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  ViewExtensionProvider:
    () =>
    <Class extends abstract new (...args: never[]) => object>(target: Class) =>
      target,
  renderRemoteReactIframeHtml: vi.fn()
}))
import type { FactoryScope } from './domain/types.js'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  FactoryArtifactEntity,
  FactoryAuditEntity,
  FactoryCaseEntity,
  FactoryExecutionRecordEntity
} from './entities/index.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { FactoryOperationsViewProvider } from './factory-view.provider.js'

const scope: FactoryScope = {
  tenantId: 'tenant-a',
  organizationId: 'factory-east',
  workspaceId: 'workspace-a',
  userId: 'operations-owner',
  assistantId: '10000000-0000-4000-8000-000000000001',
  actorType: 'user'
}

describe('FactoryOperationsService persistence boundary', () => {
  let dataSource: DataSource
  let service: FactoryOperationsService
  let caseProjects: FactoryCaseProjectService

  beforeEach(async () => {
    const memory = newDb({ autoCreateForeignKeyIndices: true })
    memory.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'factory-test'
    })
    memory.public.registerFunction({
      name: 'current_schema',
      returns: DataType.text,
      implementation: () => 'public'
    })
    memory.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16 test'
    })
    memory.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID
    })
    memory.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID
    })
    dataSource = await memory.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [FactoryPipelineEvidence,
        FactoryCaseEntity,
        FactoryArtifactEntity,
        FactoryAuditEntity,
        FactoryExecutionRecordEntity
      ],
      synchronize: true
    })
    await dataSource.initialize()
    const projectCapabilities = {
      require: () => ({
        ensure: vi.fn(async (input: { projectId: string; xpertId: string }) => ({
          projectId: input.projectId,
          xpertIds: [input.xpertId, ...FACTORY_ROLE_ASSISTANTS.map(r => r.key)],
          assistantBindings: FACTORY_ROLE_ASSISTANTS.map(r => ({ pluginName: FACTORY_PLUGIN_NAME, templateKey: r.key, agentKey: r.agentKey, xpertId: r.key })),
          operation: 'created' as const
        }))
      })
    }
    caseProjects = new FactoryCaseProjectService(
      dataSource.getRepository(FactoryCaseEntity),
      projectCapabilities as never
    )
    const policy = new FactoryApprovalPolicy({
      register() { return this }, has() { return false }, get() { return undefined }, require() { throw new Error('Not configured in this persistence test') }
    })
    vi.spyOn(policy, 'assertManagedOperation').mockResolvedValue(undefined)
    vi.spyOn(policy, 'assertHumanApprover').mockResolvedValue({ projectId: 'project', role: 'owner', canManage: true, archived: false })
    service = new FactoryOperationsService(
      dataSource.getRepository(FactoryCaseEntity),
      dataSource.getRepository(FactoryArtifactEntity),
      dataSource.getRepository(FactoryAuditEntity),
      dataSource.getRepository(FactoryExecutionRecordEntity),
      caseProjects,
      { mode: 'simulation', debug: false },
      policy, projectCapabilities as never
    )
  })

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('persists the full revision-safe governed recovery and immutable evidence trail', async () => {
    const created = await service.createDemoIncident(scope, {
      operationId: 'integration:create:m07',
      changeSummary: 'Created M-07 integration case'
    })
    const duplicate = await service.createDemoIncident(scope, {
      operationId: 'integration:create:m07',
      changeSummary: 'Created M-07 integration case'
    })
    expect(duplicate.receipt.duplicate).toBe(true)
    expect(duplicate.receipt.caseId).toBe(created.receipt.caseId)
    expect(created.summary.workspace.status).toBe('ready')
    expect(created.summary.workspace.projectId).not.toBe(created.summary.id)

    const analyzed = await service.runDemoAnalysis(scope, {
      caseId: created.receipt.caseId,
      baseRevision: created.receipt.revision,
      operationId: 'integration:analysis:m07',
      changeSummary: 'Completed bounded specialist analysis'
    })
    expect(analyzed.summary.status).toBe('awaiting_approval')
    expect(Object.values(analyzed.summary.findings).every(Boolean)).toBe(true)
    expect(analyzed.summary.plan?.recommendedOptionId).toBe('B')

    const approved = await service.approveRecoveryPlan(scope, {
      caseId: analyzed.summary.id,
      baseRevision: analyzed.summary.revision,
      operationId: 'integration:approve:m07',
      changeSummary: 'Approved recovery plan B',
      reason: '保障设备和质量安全，同时避免当天紧急订单延期。'
    })
    expect(approved.summary.plan?.approval.actorId).toBe('operations-owner')
    expect(approved.summary.plan?.approval.caseRevision).toBe(approved.summary.revision)

    const executed = await service.executeRecoveryPlan(scope, {
      caseId: approved.summary.id,
      baseRevision: approved.summary.revision,
      operationId: 'integration:execute:m07',
      changeSummary: 'Executed approved recovery plan B'
    })
    expect(executed.summary.execution?.mode).toBe('simulation')
    expect(executed.summary.execution?.actions).toHaveLength(12)
    expect(
      executed.summary.execution?.actions.every((action) => action.status === 'confirmed')
    ).toBe(true)

    const verified = await service.verifyRecovery(scope, {
      caseId: executed.summary.id,
      baseRevision: executed.summary.revision,
      operationId: 'integration:verify:m07',
      changeSummary: 'Verified equipment quality and production recovery'
    })
    expect(verified.summary.status).toBe('recovered')
    expect(verified.summary.progress.percent).toBe(100)
    expect(verified.summary.verification?.evidence.map((item) => item.source)).toEqual([
      'iot',
      'qms',
      'mes'
    ])

    const artifacts = await dataSource
      .getRepository(FactoryArtifactEntity)
      .find({ where: { caseId: created.receipt.caseId } })
    const audits = await dataSource
      .getRepository(FactoryAuditEntity)
      .find({ where: { caseId: created.receipt.caseId } })
    expect(artifacts).toHaveLength(10)
    expect(audits).toHaveLength(10)
    expect(new Set(audits.map((audit) => audit.operationId)).size).toBe(10)
  })

  it('does not leak a Case across tenant or organization scope', async () => {
    const created = await service.createDemoIncident(scope, {
      operationId: 'integration:scope:m07',
      changeSummary: 'Created scoped M-07 case'
    })
    await expect(
      service.getCaseSummary({ ...scope, tenantId: 'tenant-b' }, { caseId: created.receipt.caseId })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getCaseSummary(
        { ...scope, organizationId: 'factory-west' },
        { caseId: created.receipt.caseId }
      )
    ).rejects.toMatchObject({ status: 404 })
  })

  it('enforces non-null one-to-one Case Project identity for every new Case', async () => {
    const first = await service.createDemoIncident(scope, {
      operationId: 'integration:project:first',
      changeSummary: 'Created first Project-bound Case'
    })
    const second = await service.createDemoIncident(scope, {
      operationId: 'integration:project:second',
      changeSummary: 'Created second Project-bound Case'
    })
    expect(first.summary.workspace.projectId).not.toBe(second.summary.workspace.projectId)

    const metadata = dataSource.getMetadata(FactoryCaseEntity)
    for (const property of [
      'createdById',
      'workspaceProjectId',
      'workspaceProjectSyncStatus',
      'workspaceProjectSyncedAt'
    ]) {
      expect(metadata.findColumnWithPropertyName(property)?.isNullable).toBe(false)
    }
    expect(
      metadata.indices.some(
        (index) =>
          index.isUnique &&
          index.columns.map((column) => column.propertyName).includes('workspaceProjectId')
      )
    ).toBe(true)
  })

  it('resolves the active Project to its one-to-one Factory Case within scope', async () => {
    const first = await service.createDemoIncident(scope, {
      operationId: 'integration:view-project:first',
      changeSummary: 'Created first View Project Case'
    })
    const second = await service.createDemoIncident(scope, {
      operationId: 'integration:view-project:second',
      changeSummary: 'Created second View Project Case'
    })

    expect(
      await service.findCaseSummaryByWorkspaceProject(scope, second.summary.workspace.projectId)
    ).toMatchObject({
      id: second.summary.id,
      workspace: { projectId: second.summary.workspace.projectId }
    })
    expect(
      await service.findCaseSummaryByWorkspaceProject(
        { ...scope, organizationId: 'factory-west' },
        second.summary.workspace.projectId
      )
    ).toBeNull()

    const provider = new FactoryOperationsViewProvider(service, caseProjects, {} as never, {} as never)
    for (const slot of ['agent.workbench.fixed', 'agent.workbench.main']) {
      expect(provider.getViewManifests(viewContext(second.summary.workspace.projectId), slot).map(view => view.key))
        .toEqual(['factory-case-workspace', 'factory-operations-dashboard'])
    }
    const data = await provider.getViewData(
      viewContext(second.summary.workspace.projectId),
      'factory-case-workspace',
      {
        page: 1,
        pageSize: 1,
        selectionId: first.summary.id,
        parameters: { caseId: first.summary.id }
      }
    )

    expect(data).toMatchObject({
      selectedCase: {
        id: second.summary.id,
        workspace: { projectId: second.summary.workspace.projectId }
      },
      runtimeProjectId: second.summary.workspace.projectId
    })
    expect('table' in data && data.table?.items).toContainEqual(
      expect.objectContaining({ id: second.summary.id })
    )

    const unrelatedProjectId = '99999999-9999-4999-8999-999999999999'
    const unrelated = await provider.getViewData(
      viewContext(unrelatedProjectId),
      'factory-case-workspace',
      {
        page: 1,
        pageSize: 1,
        selectionId: first.summary.id,
        parameters: { caseId: first.summary.id }
      }
    )
    expect(unrelated).toMatchObject({
      selectedCase: null,
      projection: null,
      runtimeProjectId: unrelatedProjectId
    })
  })

})

function viewContext(projectId: string): XpertResolvedViewHostContext {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    userId: scope.userId ?? 'operations-owner',
    hostType: 'agent',
    hostId: scope.assistantId ?? '10000000-0000-4000-8000-000000000001',
    slots: [],
    runtimeScope: {
      projectId,
      conversationId: null,
      dataScopeKey: `project:${projectId}`,
      workspaceFiles: {
        catalog: 'projects',
        scopeId: projectId,
        projectId
      }
    }
  }
}
