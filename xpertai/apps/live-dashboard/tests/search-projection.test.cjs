const { test } = require('node:test')
const assert = require('node:assert/strict')
const { dashboardSearchProjection } = require('../dist/lib/dashboard-search.js')
test('shared search text excludes bindings, parameters, HTML and live data', () => {
  const result = dashboardSearchProjection({ id: 'dashboard', title: 'Public definition', charts: [{ id: 'sales', title: 'Sales' }], tables: [],
    controls: [{ controlId: 'region', label: 'Region', defaultValue: 'private-filter' }],
    bindings: [{ source: { query: 'secret-query', token: 'credential' } }], presentation: { html: '<script>secret()</script>' } }, '7')
  assert.deepEqual(result, { revision: '7', sections: [{ anchor: { kind: 'document', id: 'dashboard' }, text: 'Public definition' },
    { anchor: { kind: 'widget', id: 'sales' }, text: 'Sales' }, { anchor: { kind: 'control', id: 'region' }, text: 'Region' }] })
})
