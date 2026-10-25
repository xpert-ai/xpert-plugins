import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AssistantTaskRuntimeCapability, ProjectProvisioningRuntimeCapability, type ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { MaterialCaseService } from './case.service.js'
import { MaterialCaseEntity } from './entities.js'
import { PLUGIN_NAME } from '../artifact-namespace.js'
import { ROLES, roleDefinition } from '../roles.js'
import type { RuntimeScope } from './scope.js'

const roles = ROLES.filter(role => role.key !== 'coordinator')
const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', assistantId: 'coordinator', actorType: 'user' } as RuntimeScope

function fixture(failure?: string) {
  const entity = { id: 'case', projectId: 'project', coordinatorId: 'coordinator', projectStatus: 'provisioning', roleAssistants: {} } as MaterialCaseEntity
  const result: ProjectEnsureResult = {
    projectId: entity.projectId,
    xpertIds: ['coordinator', ...roles.map(role => `instance-${role.key}`)],
    operation: 'created'
  }
  const ensure = vi.fn(async () => result)
  const resolvePublishedAgent = vi.fn(async ({ expectation }) => {
    if (failure === 'missing' || failure === 'ambiguous') throw new Error(`assistant_binding_${failure}`)
    const role = roles.find(role => role.templateKey === expectation.templateKey)!
    return { xpertId: failure === 'not-in-project' ? 'outsider' : `instance-${role.key}`, workspaceId: 'workspace', agentKey: role.agentKey }
  })
  const assertExternalAssistantBinding = vi.fn(async () => {
    if (failure === 'not-bound') throw new Error('assistant_binding_missing')
    return {}
  })
  const update = vi.fn(async (_id, patch) => { Object.assign(entity, patch) })
  const capabilities = { require: vi.fn(capability => {
    if (capability === ProjectProvisioningRuntimeCapability) return { ensure }
    if (capability === AssistantTaskRuntimeCapability) return {
      resolvePublishedAgent: failure === 'unsupported' ? undefined : resolvePublishedAgent,
      assertExternalAssistantBinding
    }
    throw new Error('Unexpected capability')
  }) }
  const service = new MaterialCaseService({ getRepository: () => ({ update }) } as never, capabilities as never,
    { createScopedApi: () => ({ capabilities }) } as never)
  vi.spyOn(service, 'requireCase').mockResolvedValue(entity)
  vi.spyOn(service, 'assertManage').mockResolvedValue(undefined)
  return { service, entity, update, resolvePublishedAgent, assertExternalAssistantBinding }
}

describe('Material Project role synchronization', () => {
  it('uses published SDK resolution and validates each direct binding before persisting roles', async () => {
    const f = fixture()
    await f.service.ensureProject(scope, f.entity.id)
    expect(f.entity.projectStatus).toBe('ready')
    expect(f.entity.roleAssistants).toEqual(Object.fromEntries(roles.map(role => [role.key, `instance-${role.key}`])))
    for (const role of roles) {
      const expectation = { pluginName: PLUGIN_NAME, templateKey: role.templateKey, agentKey: role.agentKey }
      expect(f.resolvePublishedAgent).toHaveBeenCalledWith({ requesterXpertId: 'coordinator', expectation })
      expect(f.assertExternalAssistantBinding).toHaveBeenCalledWith({ requesterXpertId: 'coordinator',
        requesterAgentKey: roleDefinition('coordinator').agentKey, executorXpertId: `instance-${role.key}`, expectation })
    }
  })

  it.each(['missing', 'ambiguous', 'not-bound', 'not-in-project', 'unsupported'])('fails closed for %s roles', async failure => {
    const f = fixture(failure)
    await expect(f.service.ensureProject(scope, f.entity.id)).rejects.toMatchObject({ status: 409 })
    expect(f.entity.projectStatus).toBe('failed')
    expect(f.entity.roleAssistants).toEqual({})
    expect(f.update.mock.calls.some(([, patch]) => patch.projectStatus === 'ready')).toBe(false)
  })
})
