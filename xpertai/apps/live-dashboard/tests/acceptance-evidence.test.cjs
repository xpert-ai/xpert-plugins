const { test } = require('node:test')
const assert = require('node:assert/strict')
test('regression receipts exclude stale turns and retain partial batch failures', async () => {
  const { messages, receipts, toolEvidence } = await import('./acceptance/evidence.mjs')
  const old = { id: 'old', type: 'ai', content: '', tool_calls: [{ id: 'old-call', name: 'dashboard_update' }] }
  const turn = { id: 'new', type: 'ai', content: '', tool_calls: [{ id: 'edit', name: 'sandbox_multi_edit_file' }, { id: 'save', name: 'dashboard_update' }] }
  const failure = { id: 'error', type: 'tool', name: 'sandbox_multi_edit_file', tool_call_id: 'edit', content: JSON.stringify({ error: 'ambiguous', progress: { mode: 'sequential', appliedEdits: 1, failedEdit: 2 } }) }
  const receipt = { id: 'receipt', type: 'tool', name: 'dashboard_update', tool_call_id: 'save', content: JSON.stringify({ dashboard: { artifactId: 'id', draftRevision: 3 }, sourceFile: { sha256: 'hash' } }) }
  const state = { messages: [old, turn, failure, receipt], lc_kwargs: { messages: [old, turn] } }
  assert.equal(messages(state).length, 4)
  assert.equal(receipts(state).length, 1)
  const evidence = toolEvidence(state, ['old'])
  assert.equal(evidence.saveCalls, 1)
  assert.equal(evidence.calls.length, 2)
  assert.equal(evidence.errors.length, 1)
  assert.equal(evidence.errors[0].progress.appliedEdits, 1)
  assert.equal(evidence.errors[0].toolCallId, 'edit')
  assert.equal(receipts({ messages: [{ id: 'claim', content: 'Saved v5' }] }).length, 0)
  assert.equal(receipts({ messages: [turn, { id: 'fake', type: 'ai', content: receipt.content }] }).length, 0)
  assert.equal(receipts({ messages: [turn, { ...receipt, tool_call_id: 'unknown' }] }).length, 0)
  assert.equal(receipts({ messages: [turn, { ...receipt, status: 'error' }] }).length, 0)
})


test('HTML hash fallback accepts real earlier saves and rejects model-claimed evidence', async () => {
  const { assertSavedDocumentEvidence } = await import('./acceptance/evidence.mjs')
  const html = '<html><body>Saved</body></html>'
  const sourceFile = { sha256: require('node:crypto').createHash('sha256').update(html).digest('hex') }
  const htmlReceipt = { dashboard: { artifactId: 'id', draftRevision: 1, title: 'Old' }, sourceFile }
  const latest = { dashboard: { artifactId: 'id', draftRevision: 2, title: 'Renamed' } }
  const document = { artifactId: 'id', draftRevision: 2, title: 'Renamed', isDraft: true, manifest: { presentation: { html } } }
  const call = { id: 'calls', type: 'ai', content: '', tool_calls: [{ id: 'html', name: 'dashboard_update' }, { id: 'title', name: 'dashboard_update' }] }
  const tool = (id, value) => ({ id, type: 'tool', name: 'dashboard_update', tool_call_id: id, content: JSON.stringify(value) })
  const save = tool('html', htmlReceipt), rename = tool('title', latest)
  assert.doesNotThrow(() => assertSavedDocumentEvidence({ messages: [call, save, rename] }, latest, document))
  assert.throws(() => assertSavedDocumentEvidence({ messages: [call, { id: 'claim', type: 'ai', content: save.content }, rename] }, latest, document), /No successful HTML/)
  assert.throws(() => assertSavedDocumentEvidence({ messages: [call, { ...save, status: 'error' }, rename] }, latest, document), /No successful HTML/)
  const unrelated = tool('html', { ...htmlReceipt, dashboard: { ...htmlReceipt.dashboard, artifactId: 'another' } })
  assert.throws(() => assertSavedDocumentEvidence({ messages: [call, unrelated, rename] }, latest, document), /No successful HTML/)
  assert.throws(() => assertSavedDocumentEvidence({ messages: [call, save] }, latest, document), /actual successful mutation/)
  assert.throws(() => assertSavedDocumentEvidence({ messages: [call, save, rename] }, latest, { ...document, manifest: { presentation: { html: 'different' } } }), /Saved HTML differs/)
})

test('complete UI acceptance requires source mutation and every boundary check', async () => {
  const { assertUiAcceptance } = await import('./acceptance/evidence.mjs')
  const ui = { passed: true, sourcesRestored: true, documentPreserved: true,
    boundary: { unknownBinding: true, unknownControl: true, parentDOM: true, directFetch: true },
    checks: ['initial', 'east', 'sourceChangedToolbarRefresh', 'pageRefresh', 'west', 'all', 'cardReopen', 'reloadRestored'].map(stage => ({ stage })) }
  assert.doesNotThrow(() => assertUiAcceptance(ui))
  const readOnly = structuredClone(ui); readOnly.checks[2].stage = 'toolbarRefresh'
  assert.throws(() => assertUiAcceptance(readOnly), /source-mutation UI sequence/)
  assert.throws(() => assertUiAcceptance({ ...ui, checks: [] }), /source-mutation UI sequence/)
  assert.throws(() => assertUiAcceptance({ ...ui, boundary: {} }), /Missing frame boundary/)
  assert.throws(() => assertUiAcceptance({ ...ui, sourcesRestored: false }), /restoration failed/)
  assert.throws(() => assertUiAcceptance({ ...ui, documentPreserved: false }), /page instance/)
})

test('multi-model baseline rejects picker-only evidence, wrong models and changed tuning', async () => {
  const { assertModelEvidence } = await import('./acceptance/evidence.mjs')
  const expected = { threadId: 'thread', id: 'model-id', name: 'model-name', copilotId: 'connection', options: { temperature: 0.1 } }
  const execution = { threadId: 'thread', parentId: null, status: 'success', metadata: {
    primaryModelId: expected.id, primaryModelSnapshot: { model: expected.name, copilotId: expected.copilotId, options: expected.options }
  } }
  assert.doesNotThrow(() => assertModelEvidence(execution, expected))
  assert.throws(() => assertModelEvidence({ ...execution, metadata: undefined }, expected), /model ID/)
  assert.throws(() => assertModelEvidence({ ...execution, threadId: 'other' }, expected), /another conversation/)
  assert.throws(() => assertModelEvidence({ ...execution, parentId: 'parent' }, expected), /root execution/)
  assert.throws(() => assertModelEvidence({ ...execution, status: 'error' }, expected), /did not succeed/)
  assert.throws(() => assertModelEvidence(execution, { ...expected, name: 'fallback' }), /model name/)
  assert.throws(() => assertModelEvidence(execution, { ...expected, options: { temperature: 1 } }), /options changed/)
})

test('new generation cannot pass with an update of a historical Artifact', async () => {
  const { assertCreatedDashboardEvidence } = await import('./acceptance/evidence.mjs')
  const receipt = { dashboard: { artifactId: 'new', draftRevision: 1 } }
  const state = (name, result = receipt) => ({ messages: [
    { id: 'call', content: '', tool_calls: [{ id: 'save', name }] },
    { id: 'reply', name, tool_call_id: 'save', content: JSON.stringify(result) }
  ] })
  assert.doesNotThrow(() => assertCreatedDashboardEvidence(state('dashboard_create_html'), receipt))
  assert.throws(() => assertCreatedDashboardEvidence(state('dashboard_update'), receipt), /create a new Artifact/)
  assert.throws(() => assertCreatedDashboardEvidence(state('dashboard_create_html', { dashboard: { artifactId: 'other', draftRevision: 1 } }), receipt), /create a new Artifact/)
})

test('business counts deduplicate data and visual failures and include repair-round findings', async () => {
  const { summarizeBusinessEvidence } = await import('./acceptance/evidence.mjs')
  const cases = [{ format: 'csv' }, { format: 'json' }, { format: 'xlsx' }]
  const rounds = cases.flatMap(({ format }) => [format === 'json' ? 'json-repair' : format, `${format}-edit1`, `${format}-edit2`].map(name => ({ name })))
  const repairs = [{ format: 'json' }]
  const initialVisual = [{ format: 'json', round: 'json' }]
  assert.deepEqual(summarizeBusinessEvidence(cases, rounds, repairs, initialVisual), {
    initialGeneration: { cases: 3, dataInteractionFirstPass: 2, businessFirstPass: 2, requiredBusinessRepair: 1 },
    dataAcceptedRounds: 9, acceptedRounds: 9, businessFailedAttempts: 1
  })
  assert.deepEqual(summarizeBusinessEvidence(cases, rounds, repairs, [...initialVisual,
    { format: 'json', round: 'json-repair' }, { format: 'csv', round: 'csv' }]), {
    initialGeneration: { cases: 3, dataInteractionFirstPass: 2, businessFirstPass: 1, requiredBusinessRepair: 2 },
    dataAcceptedRounds: 9, acceptedRounds: 7, businessFailedAttempts: 3
  })
})
