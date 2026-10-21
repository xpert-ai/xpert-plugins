const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Workbook } = require('exceljs')
const { Zip, ZipDeflate, zipSync, unzipSync, strToU8 } = require('fflate')
const { ForbiddenException } = require('@nestjs/common')
const { FileAnalyticsProvider, contractHash } = require('../dist/lib/provider')
const { optionsSchema, payloadSchema } = require('../dist/lib/schema')
const { readRows } = require('../dist/lib/readers')
const { executeQuery, outputColumns } = require('../dist/lib/query')
const { queryWorker } = require('../dist/lib/worker-client')
const { normalizeAnalyticsResult, analyticsDiscoveryResultSchema, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const columns = [
  { key: 'region', path: ['区域'], label: '区域', description: 'Sales region', logicalType: 'string', nullable: false, role: 'dimension' },
  { key: 'amount', path: ['净额'], label: '净额', description: 'Paid less refunds, CNY', logicalType: 'decimal', nullable: false, role: 'measure', unit: 'CNY' }
]
function fixture() {
  const state = { buffer: Buffer.from('\uFEFF区域,净额\r\n华东,9007199254740993.12\r\n华西,0.10\r\n华西,0.20\r\n'), access: true, reads: 0, checks: 0, revokeAfterRead: false }
  const options = optionsSchema.parse({ datasets: [{ id: 'sales', revision: 'v1', name: 'Sales', description: 'Net paid sales in CNY',
    file: { catalog: 'xperts', xpertId: uuid(1), filePath: 'sales.csv' }, reader: { format: 'csv' }, columns }] })
  const context = { actor: { tenantId: uuid(2), organizationId: uuid(3), userId: uuid(4) }, dataSourceId: uuid(5), options,
    signal: new AbortController().signal, deadlineAt: Date.now() + 30000, timeoutMs: 30000, maxRows: 1000, executionId: 'query1', ancestry: ['file.table'] }
  const files = { resolveFile: async ref => { state.checks++; if (!state.access) throw new ForbiddenException('revoked'); return { size: state.buffer.length, catalog: ref.catalog } },
    readBuffer: async ref => { assert.equal(ref.userId, context.actor.userId); assert.equal(ref.tenantId, context.actor.tenantId); state.reads++; if (state.revokeAfterRead) state.access = false; return { buffer: state.buffer } } }
  const provider = new FileAnalyticsProvider({ require: capability => {
    if (capability.id === 'platform.workspace.files') return files
    if (capability.id === 'platform.project.access') return { listReadable: async () => [] }
    throw Error(capability.id)
  } })
  const query = payloadSchema.parse({ datasetId: 'sales', revision: 'v1', contractHash: contractHash(options.datasets[0]), select: ['region', 'amount'],
    filters: [{ column: 'region', operator: 'eq', value: { type: 'parameter', name: 'region' }, skipWhenNull: true }] })
  const binding = { schemaVersion: 1, id: 'sales', dataSourceId: uuid(5), providerId: 'file.table', operation: 'query', contractVersion: 1, payload: query,
    parameters: [{ name: 'region', controlId: 'region', type: 'string', required: false, defaultValue: null }],
    output: { datasetId: 'sales', grain: [], fields: columns.map(({ key, path, description, ...field }) => ({ ...field, id: key, sourceField: key })) } }
  return { state, options, context, files, provider, query, binding, definition: options.datasets[0] }
}
test('discovery exposes current typed previews and native query contracts, without file scope or paths', async () => {
  const f = fixture()
  const listing = await f.provider.discover({}, f.context), detail = await f.provider.discover(listing.items[0].inspectRequest, f.context)
  analyticsDiscoveryResultSchema.parse(detail)
  assert.equal(detail.items[0].metadata.preview.length, 3)
  for (const secret of ['sales.csv', uuid(1), uuid(2), uuid(4)]) assert(!JSON.stringify(detail).includes(secret))
  assert.equal(detail.items[0].metadata.bindingPayload.contractHash, f.query.contractHash)
  const canonical = detail.items[0].metadata.binding
  const result = normalizeAnalyticsResult(canonical, await f.provider.execute(canonical, {}, f.context), 'discovery-copy', 1000)
  assert.equal(result.rows.length, 3)
  assert.deepEqual(result.grain, [])
  f.state.access = false
  assert.deepEqual((await f.provider.discover({}, f.context)).items, [])
  await assert.rejects(f.provider.discover({ datasetId: 'sales' }, f.context), /revoked/)
})
test('filter, file update, serialized Binding reopen and freshness all re-read authorized files', async () => {
  const f = fixture()
  const all = normalizeAnalyticsResult(f.binding, await f.provider.execute(f.binding, { region: null }, f.context), 'q1', 1000)
  assert.equal(all.rows[0].amount, '9007199254740993.12')
  assert.equal(all.completeness.scope, 'full_query_result')
  const filtered = await f.provider.execute(f.binding, { region: '华西' }, f.context)
  assert.deepEqual(filtered.rows.map(r => r.amount), ['0.1', '0.2'])
  f.state.buffer = Buffer.from('区域,净额\n华西,42.30\n')
  const reopened = await f.provider.execute(JSON.parse(JSON.stringify(f.binding)), { region: '华西' }, f.context)
  assert.equal(reopened.rows[0].amount, '42.3')
  assert.notEqual(reopened.sourceVersion, all.provenance.sourceVersion)
  assert.equal(f.state.reads, 3); assert.equal(f.state.checks, 6)
})
test('exact group aggregation, sorting, count and global totals', async () => {
  const f = fixture(), rows = await readRows(f.state.buffer, f.definition)
  const query = { ...f.query, select: ['region', 'total', 'count'], groupBy: ['region'], aggregates: [{ key: 'total', operation: 'sum', column: 'amount' }, { key: 'count', operation: 'count' }], orderBy: [{ column: 'total', direction: 'desc' }] }
  const result = executeQuery(rows, f.definition, query, { region: null }, 1000)
  assert.deepEqual(result.rows, [{ region: '华东', total: '9007199254740993.12', count: '1' }, { region: '华西', total: '0.3', count: '2' }])
  assert.equal(outputColumns(f.definition, query)[1].nullable, true)
  query.groupBy = []; query.select = ['total', 'count']
  assert.deepEqual(executeQuery(rows, f.definition, query, { region: null }, 1000).rows, [{ total: '9007199254740993.42', count: '3' }])
})
test('empty rows keep schema, empty sum is null and count is zero', async () => {
  const f = fixture(); f.state.buffer = Buffer.from('区域,净额\n')
  const result = await f.provider.execute(f.binding, { region: null }, f.context)
  assert.deepEqual(result.columns, [{ key: 'region' }, { key: 'amount' }]); assert.deepEqual(result.rows, [])
  const q = { ...f.query, select: ['total', 'count'], aggregates: [{ key: 'total', operation: 'sum', column: 'amount' }, { key: 'count', operation: 'count' }] }
  assert.deepEqual(executeQuery([], f.definition, q, { region: null }, 1000).rows, [{ total: null, count: '0' }])
})
test('row limits truncate output after complete aggregation, never input silently', async () => {
  const f = fixture(); f.context.maxRows = 1
  const result = await f.provider.execute(f.binding, { region: null }, f.context)
  assert.deepEqual(result.completeness, { returnedRows: 1, totalRows: 3, scope: 'page', truncated: true, totalAccuracy: 'exact' })
  await assert.rejects(readRows(Buffer.from('区域,净额\n' + '华东,1\n'.repeat(50001)), f.definition), /INPUT_LIMIT/)
})
test('permissions are checked before reading and again after processing', async () => {
  const f = fixture(); f.state.access = false
  await assert.rejects(f.provider.execute(f.binding, { region: null }, f.context), /revoked/); assert.equal(f.state.reads, 0)
  f.state.access = true; f.state.revokeAfterRead = true
  await assert.rejects(f.provider.execute(f.binding, { region: null }, f.context), /revoked/); assert.equal(f.state.reads, 1)
})
test('private file owner and Project membership cannot be replaced by the current viewer', async () => {
  const f = fixture()
  for (const file of [{ catalog: 'users', userId: uuid(99), filePath: 'sales.csv' }, { catalog: 'projects', projectId: uuid(99), filePath: 'sales.csv' }]) {
    f.definition.file = file; f.query.contractHash = contractHash(f.definition)
    await assert.rejects(f.provider.execute(f.binding, { region: null }, f.context), /ACCESS_DENIED/)
  }
  assert.equal(f.state.reads, 0)
})
test('strict payload and controls reject path, source, reader, SQL and parameter overrides before data access', async () => {
  const f = fixture()
  for (const key of ['file', 'filePath', 'reader', 'url', 'sql', 'userId', 'dataSourceId']) {
    await assert.rejects(f.provider.execute({ ...f.binding, payload: { ...f.query, [key]: 'override' } }, { region: null }, f.context))
  }
  assert.equal(f.state.reads, 0)
  assert.throws(() => resolveAnalyticsParameters(f.binding, { region: null, filePath: 'secret.csv' }), /UNKNOWN_CONTROL/)
  const rows = await readRows(f.state.buffer, f.definition)
  assert.throws(() => executeQuery(rows, f.definition, f.query, { region: null, other: 1 }, 1000), /PARAMETERS_INVALID/)
})
test('retargeted files, reader/column changes and stale revisions invalidate saved contracts', async () => {
  for (const change of [d => d.file.filePath = 'other.csv', d => d.revision = 'v2', d => d.columns[1].unit = 'USD', d => d.reader.delimiter = ';']) {
    const f = fixture(); change(f.definition)
    await assert.rejects(f.provider.execute(f.binding, { region: null }, f.context), /CONTRACT_CHANGED/); assert.equal(f.state.reads, 0)
  }
})
test('output cannot reinterpret a decimal as a string or change its unit', async () => {
  const f = fixture(); f.binding.output.fields[1].unit = 'USD'
  await assert.rejects(f.provider.execute(f.binding, { region: null }, f.context), /OUTPUT_CONTRACT_INVALID/)
  assert.equal(f.state.reads, 0)
})
test('CSV quoted multiline fields, BOM and delimiters are parsed without trimming business values', async () => {
  const f = fixture(); f.definition.reader.delimiter = ';'
  assert.deepEqual(await readRows(Buffer.from('\uFEFF区域;净额\r\n" 华\n东 ";1.10\r\n'), f.definition), [{ region: ' 华\n东 ', amount: '1.1' }])
})
test('schema drift, duplicate headers, missing cells and invalid UTF-8 fail closed', async () => {
  const f = fixture()
  for (const content of ['区域,金额\n华东,1', '区域,区域\n华东,1', '区域,净额\n华东', '区域,净额\n华东,']) await assert.rejects(readRows(Buffer.from(content), f.definition))
  await assert.rejects(readRows(Buffer.from([0xff, 0xff]), f.definition))
})
test('JSON nested rows and exact string decimals; objects, missing paths and lossy numeric amounts rejected', async () => {
  const f = fixture(); f.definition.reader = { format: 'json', rowsPath: ['data', 'rows'] }
  assert.deepEqual(await readRows(Buffer.from(JSON.stringify({ data: { rows: [{ 区域: 'East', 净额: '0.10' }] } })), f.definition), [{ region: 'East', amount: '0.1' }])
  for (const rows of [[{ 区域: 'East', 净额: 0.1 }], [{ 区域: 'East' }], [{ 区域: {}, 净额: '1' }], {}])
    await assert.rejects(readRows(Buffer.from(JSON.stringify({ data: { rows } })), f.definition))
})
test('configuration rejects path traversal, scope injection and prototype selectors', () => {
  const f = fixture()
  for (const path of ['../secret', '/tmp/a', 'a/../b', 'a\\b', 'a\0b', './a']) {
    const options = structuredClone(f.options); options.datasets[0].file.filePath = path; assert.equal(optionsSchema.safeParse(options).success, false)
  }
  f.definition.columns[0].path = ['__proto__']; assert.equal(optionsSchema.safeParse(f.options).success, false)
})
test('cancellation and deadline terminate worker execution', async () => {
  const f = fixture(), controller = new AbortController()
  const result = queryWorker(f.state.buffer, f.definition, f.query, { region: null }, 1000, controller.signal, Date.now() + 30000)
  controller.abort(); await assert.rejects(result, /CANCELLED/)
  await assert.rejects(queryWorker(f.state.buffer, f.definition, f.query, { region: null }, 1000, new AbortController().signal, Date.now() - 1), /DEADLINE/)
})
async function excel(rows, callback) {
  const book = new Workbook(), sheet = book.addWorksheet('销售'); sheet.addRows([['区域', '净额'], ...rows]); callback?.(sheet)
  return Buffer.from(await book.xlsx.writeBuffer())
}
test('XLSX explicit sheet reads numbers and exact text cells; stale formula caches require explicit opt-in', async () => {
  const f = fixture(); f.definition.reader = { format: 'xlsx', sheet: '销售', headerRow: 1, formulaPolicy: 'reject' }
  assert.deepEqual(await readRows(await excel([['East', 12.3], ['West', '9007199254740993.12']]), f.definition), [{ region: 'East', amount: '12.3' }, { region: 'West', amount: '9007199254740993.12' }])
  const bytes = await excel([['East', { formula: '1+2', result: 3 }]])
  await assert.rejects(readRows(bytes, f.definition), /FORMULA_DENIED/)
  f.definition.reader.formulaPolicy = 'cached'
  assert.equal((await readRows(bytes, f.definition))[0].amount, '3')
  await assert.rejects(readRows(await excel([['East', { formula: '1+2' }]]), f.definition), /CACHE_MISSING/)
})
test('XLSX missing/hidden sheets, merged data cells, external links, macros and ZIP expansion are rejected', async () => {
  const f = fixture(); f.definition.reader = { format: 'xlsx', sheet: '销售', headerRow: 1, formulaPolicy: 'reject' }
  await assert.rejects(readRows(await excel([['East', 1]], s => s.state = 'hidden'), f.definition), /SHEET_UNAVAILABLE/)
  await assert.rejects(readRows(await excel([['East', 1]], s => s.mergeCells('A2:B2')), f.definition), /MERGED_CELL/)
  for (const name of ['xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml']) await assert.rejects(readRows(Buffer.from(zipSync({ [name]: strToU8('test') })), f.definition), /EXTERNAL_CONTENT/)
  const bomb = zipSync({ 'xl/a.xml': new Uint8Array(40_000_001) })
  await assert.rejects(readRows(Buffer.from(bomb), f.definition), /EXPANSION_LIMIT/)
})
test('XLSX passes the shipped worker path used by the provider', async () => {
  const f = fixture(); f.definition.reader = { format: 'xlsx', sheet: '销售', headerRow: 1, formulaPolicy: 'reject' }
  f.query.contractHash = contractHash(f.definition); f.state.buffer = await excel([['East', 12.3]])
  assert.deepEqual((await f.provider.execute(f.binding, { region: null }, f.context)).rows, [{ region: 'East', amount: '12.3' }])
})
test('XLSX rejects forged uncompressed sizes before workbook parsing', async () => {
  const f = fixture(); f.definition.reader = { format: 'xlsx', sheet: '销售', headerRow: 1, formulaPolicy: 'reject' }
  const entries = unzipSync(await excel([['East', 1]]))
  entries['xl/padding.xml'] = new Uint8Array(1_000_000)
  const bytes = Buffer.from(zipSync(entries))
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  let offset = bytes.readUInt32LE(end + 16), altered = false
  while (bytes.readUInt32LE(offset) === 0x02014b50) {
    const nameSize = bytes.readUInt16LE(offset + 28)
    if (bytes.subarray(offset + 46, offset + 46 + nameSize).toString() === 'xl/padding.xml') {
      bytes.writeUInt32LE(1, bytes.readUInt32LE(offset + 42) + 22)
      bytes.writeUInt32LE(1, offset + 24)
      altered = true; break
    }
    offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  assert(altered)
  await assert.rejects(readRows(bytes, f.definition), /FILE_DATASET_XLSX_EXPANSION_LIMIT/)
})
test('XLSX accepts streaming ZIP entries with data descriptors and stored ZIP entries', async () => {
  const f = fixture(); f.definition.reader = { format: 'xlsx', sheet: '销售', headerRow: 1, formulaPolicy: 'reject' }
  const entries = unzipSync(await excel([['East', 1]])), chunks = []
  const archive = new Zip((error, chunk) => { assert.ifError(error); chunks.push(chunk) })
  for (const [name, bytes] of Object.entries(entries)) {
    const entry = new ZipDeflate(name); archive.add(entry); entry.push(bytes, true)
  }
  archive.end()
  for (const bytes of [Buffer.concat(chunks), Buffer.from(zipSync(entries, { level: 0 }))])
    assert.deepEqual(await readRows(bytes, f.definition), [{ region: 'East', amount: '1' }])
})
