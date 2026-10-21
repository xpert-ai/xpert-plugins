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
    runtime: { viewHost: { type: 'agent', id: 'assistant' } } })
  assert.equal(reviewRuntimeScope(scope).viewHost, undefined)
  assert.equal(reviewRuntimeScope(scope).executionId, undefined)
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
