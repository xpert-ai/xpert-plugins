import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopeSchema } from '../src/domain.js'
import { middlewareScope, reviewRuntimeScope, viewScope } from '../src/runtime-scope.js'

const identity = { tenantId: 'tenant', organizationId: 'organization', userId: 'user', workspaceId: 'workspace' }

test('authorized View connector calls retain the host identity before a conversation exists', () => {
  const scope = reviewRuntimeScope(viewScope({ ...identity, hostType: 'agent', hostId: 'assistant',
    runtimeScope: { projectId: 'project' } }))
  assert.deepEqual(scope.viewHost, { type: 'agent', id: 'assistant' })
  assert.equal(scope.xpertId, scope.viewHost?.id)
  assert.equal(scope.projectId, 'project')
  assert.equal(scope.conversationId, undefined)
  assert.deepEqual(scope.connectorProviders, ['github'])
})

test('Agent connector calls preserve execution identity without impersonating a View', () => {
  const context = { ...identity, xpertId: 'assistant', conversationId: 'conversation', executionId: 'execution', projectId: 'project' }
  const scope = reviewRuntimeScope(middlewareScope(context))
  assert.equal(scope.conversationId, 'conversation')
  assert.equal(scope.executionId, 'execution')
  assert.equal(scope.projectId, 'project')
  assert.equal(scope.viewHost, undefined)
  context.executionId = 'next-execution'
  assert.equal(reviewRuntimeScope(middlewareScope(context)).executionId, 'next-execution')
})

test('business scope parsing cannot grant View access from untrusted extra properties', () => {
  const scope = scopeSchema.parse({ ...identity, assistantId: 'assistant',
    permissions: ['XPERT_EDIT'], hostSnapshot: { name: 'Forged' }, assistant: { principalUserId: 'forged' },
    runtime: { viewHost: { type: 'agent', id: 'assistant' } } })
  assert(!('permissions' in scope)); assert(!('assistant' in scope)); assert(!('hostSnapshot' in scope))
  assert.equal(reviewRuntimeScope(scope).viewHost, undefined)
  assert.equal(reviewRuntimeScope(scope).executionId, undefined)
})

test('View authorization and display reuse host context while identity contains only account references', () => {
  const assistant = { instanceId: 'assistant', currentId: 'assistant', versionIds: ['assistant'], principalUserId: 'technical-user' }
  const scope = viewScope({ ...identity, hostType: 'agent', hostId: 'assistant', assistant,
    permissions: ['XPERT_EDIT'], hostSnapshot: { name: 'review', title: 'Review Assistant',
      organization: { id: 'organization', name: 'Organization' }, workspace: { id: 'workspace', name: 'Workspace' },
      graph: { private: true }, access: { canManageOrganization: true } } })
  assert.deepEqual(scope.assistant, assistant)
  assert.deepEqual(scope.permissions, ['XPERT_EDIT'])
  assert.deepEqual(scope.hostSnapshot, { name: 'review', title: 'Review Assistant',
    organization: { name: 'Organization' }, workspace: { name: 'Workspace' } })
  assert.equal(scope.userId, identity.userId)
})

test('tool invocation resolves execution identity assigned after middleware construction', () => {
  const context = { ...identity, xpertId: 'assistant' }
  const scope = reviewRuntimeScope(middlewareScope(context, { configurable: {
    conversation_id: 'task-conversation', executionId: 'task-execution',
    viewHost: { type: 'agent', id: 'untrusted-host' }, userId: 'untrusted-user'
  } }))
  assert.equal(scope.conversationId, 'task-conversation')
  assert.equal(scope.executionId, 'task-execution')
  assert.equal(scope.viewHost, undefined)
  assert.equal(scope.userId, identity.userId)
})
