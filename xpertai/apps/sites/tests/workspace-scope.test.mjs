import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFixture, scope } from '../.artifacts/sites-spec/lib/sites-artifacts.spec.js'

for (const catalog of ['xperts', 'user-xperts']) {
  test(`deployment preserves the host ${catalog} file reference`, async () => {
    let written
    const fixture = createFixture(async input => {
      // The host authorizes the Assistant and returns its current storage policy.
      // A plugin-imposed isolation policy is incompatible with shared Assistants.
      if (catalog === 'xperts' && input.isolateByUser === true) {
        throw new Error('Workspace file access was denied.')
      }
      assert.equal(input.tenantId, scope.tenantId)
      assert.equal(input.organizationId, scope.organizationId)
      assert.equal(input.userId, scope.userId)
      assert.equal(input.xpertId, scope.assistantId)
      assert.equal(input.catalog, undefined)
      assert.equal(input.scopeId, undefined)
      assert.equal(input.isolateByUser, undefined)
      const filePath = `sites/deployments/${input.fileName}`
      written = {
        name: input.fileName,
        filePath,
        workspacePath: `/workspace/${filePath}`,
        mimeType: input.mimeType,
        size: input.buffer.length,
        catalog,
        scopeId: scope.assistantId,
        reference: {
          source: 'platform.workspace.files',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          userId: scope.userId,
          xpertId: scope.assistantId,
          catalog,
          scopeId: scope.assistantId,
          filePath,
          workspacePath: `/workspace/${filePath}`
        }
      }
      return written
    })
    const deployment = await fixture.service.deployVersion({ projectId: 'project-id', versionId: 'version-id' }, scope)
    assert.equal(deployment.status, 'deployed')
    assert.ok(written)
    assert.equal(fixture.calls.createArtifactVersion[0][0].workspaceFileRef, written.reference)
    assert.equal(fixture.calls.createArtifact[0][0].scope?.userId, scope.userId)
  })
}

test('denied workspace writes fail deployment before publishing an Artifact', async () => {
  const denied = new Error('Workspace file access was denied.')
  const fixture = createFixture(async () => { throw denied })
  await assert.rejects(
    fixture.service.deployVersion({ projectId: 'project-id', versionId: 'version-id' }, scope),
    error => error === denied
  )
  assert.equal(fixture.repositories.deployments.items[0].status, 'failed')
  assert.equal(fixture.repositories.projects.items[0].currentDeploymentId, undefined)
  assert.equal(fixture.calls.createArtifact.length, 0)
  assert.equal(fixture.calls.createArtifactVersion.length, 0)
  assert.equal(fixture.calls.createArtifactLink.length, 0)
})
