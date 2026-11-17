const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setup } = require('./service-fixture.cjs')
const { DashboardDatasetService } = require('../dist/lib/dataset.service')
const { datasetDefinitionSchema } = require('../dist/lib/dataset.schema')
const example = require('../examples/postgres-sales.json')

function fixture() {
  const f = setup()
  f.capabilities['platform.artifacts'].createArtifact = async input => {
    assert.equal(input.type.pluginName, '@xpert-ai/plugin-live-dashboard')
    const artifact = { id: randomUUID(), status: 'active', ...input.source, ...input.scope, title: input.title }
    f.artifacts.set(artifact.id, artifact); return artifact
  }
  f.capabilities['platform.artifacts'].listArtifacts = async ({ pluginName, resourceType, resourceIdPrefix, status, page = 1, pageSize = 30 }) => {
    const items = [...f.artifacts.values()].filter(item => item.pluginName === pluginName && item.resourceType === resourceType && item.status === status && item.resourceId.startsWith(resourceIdPrefix))
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length }
  }
  f.capabilities['platform.artifact-drafts'].setRecycled = async ({ artifactId, expectedRevision }) => {
    if (f.drafts.get(artifactId).revision !== expectedRevision) throw Error('DRAFT_CONFLICT')
    f.artifacts.get(artifactId).status = 'archived'
  }
  const library = new DashboardDatasetService(f.service, { require: key => f.capabilities[key.id] })
  const definition = datasetDefinitionSchema.parse({ schema: 'xpert.live-dashboard.dataset', id: randomUUID(), name: 'Regional sales', binding: example.bindings[0], controls: { region: 'all' } })
  return { ...f, library, definition }
}

module.exports = { fixture }
