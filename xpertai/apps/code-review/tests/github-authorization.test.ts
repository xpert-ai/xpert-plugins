import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectGitHubAccount } from '../remote-components/code-review/src/github-authorization.js'

test('Code Review requests its OAuth method and selected integration through the generic host command', async () => {
  const result = await connectGitHubAccount('selected-integration', async (key, payload) => {
    assert.equal(key, 'workspace.connector.connect')
    assert.deepEqual(payload, { provider: 'github', authMethodId: 'github-app-oauth', integrationId: 'selected-integration' })
    assert.deepEqual(Object.keys(payload).sort(), ['authMethodId', 'integrationId', 'provider'])
    return { status: 'cancelled' }
  })
  assert.deepEqual(result, { status: 'cancelled' })
})

test('legacy setup retains an unconstrained account connection', async () => {
  await connectGitHubAccount(null, async (_key, payload) => {
    assert.deepEqual(payload, { provider: 'github' })
  })
})

test('generic host failures are translated into GitHub guidance only by the plugin', async () => {
  for (const [code, expected] of [
    ['connector_auth_method_unavailable', 'github_oauth_unavailable'],
    ['connector_integration_unsupported', 'github_oauth_unavailable'],
    ['connector_integration_unavailable', 'github_integration_unavailable'],
    ['connector_connection_mismatch', 'github_integration_mismatch'],
    ['workspace_management_required', 'workspace_management_required'],
    ['context_changed', 'context_changed']
  ]) {
    await assert.rejects(connectGitHubAccount('selected-integration', async () => { throw new Error(code) }),
      error => error instanceof Error && error.message === expected)
  }
})
