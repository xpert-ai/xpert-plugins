const { fixture } = require('./dataset-fixture.cjs')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider')

function dataViewFixture() {
  const f = fixture(), binding = f.definition.binding
  f.sources[0] = { source: binding.source, name: 'Synthetic sales source', providers: [{
    id: binding.providerId, name: 'SQL', operations: [{ name: binding.operation, contractVersion: binding.contractVersion, readOnly: true }]
  }] }
  const discoveries = []
  f.capabilities['platform.analytics'].discover = async (actor, input) => {
    discoveries.push({ actor, input })
    if (f.calls.denied) throw Error('SOURCE_ACCESS_REVOKED')
    return { items: [{ id: 'sales', name: 'Synthetic sales table', kind: 'dataset', metadata: { fields: binding.output.fields } }],
      queryContract: { operation: binding.operation, contractVersion: binding.contractVersion,
        payloadSchema: { type: 'object' }, instructions: 'Synthetic fixture: inspect the existing sales query.' } }
  }
  return { ...f, discoveries, provider: new DashboardLibraryViewProvider(f.service, f.library) }
}

module.exports = { dataViewFixture }
