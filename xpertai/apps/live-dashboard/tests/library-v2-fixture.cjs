const { randomUUID } = require('node:crypto')
const { reference } = require('../dist/lib/library/archive.js')
const { sha256 } = require('../dist/lib/library/resource-json.js')
const { LibraryCatalogService } = require('../dist/lib/library/catalog.service.js')
const { LibraryFilesService } = require('../dist/lib/library/files.service.js')
const { LibraryTransfersService } = require('../dist/lib/library/transfers.service.js')
const entities = require('../dist/lib/library/entities.js')

const license = { identifier: 'CC0-1.0', attribution: 'Synthetic test fixture' }
const requirements = { skills: [], plugins: [], capabilities: [] }
function header(kind) {
  return { schema: 'xpert.library.resource', formatVersion: 2, logicalId: randomUUID(), version: '1.0.0', kind,
    title: '销售趋势', description: 'Synthetic fixture, not real customer data', locale: 'zh-CN', categories: ['sales'], tags: [],
    license, provenance: { kind: 'synthetic', description: 'Generated for tests' }, dependencies: [], assets: [] }
}
function asset(bytes, overrides = {}) {
  return { id: 'data', sha256: sha256(bytes), size: bytes.length, mimeType: 'text/csv', fileName: 'sales.csv', purpose: 'data', license, ...overrides }
}
function graph() {
  const bytes = Buffer.from('month,revenue\n2026-01,120\n2026-02,180\n')
  const file = asset(bytes)
  const dataset = { ...header('public-dataset'), assets: [file], content: { dataAssetId: file.id, format: 'csv',
    readerOptions: { encoding: 'utf-8', delimiter: ',' }, columns: [
      { key: 'month', label: '月份', logicalType: 'string', nullable: false },
      { key: 'revenue', label: '收入', logicalType: 'float64', nullable: false }], statistics: { rowCount: 2 } } }
  const template = { ...header('analysis-template'), content: { inputSlots: [{ key: 'sales', grain: ['month'], fields: [
    { role: 'month', label: '月份', logicalType: 'string', required: true, nullable: false },
    { role: 'revenue', label: '收入', logicalType: 'float64', required: true, nullable: false }] }],
    parameters: [], metrics: [{ key: 'revenue', label: '收入', unit: 'CNY', definition: '按月份汇总收入' }],
    presentation: { type: 'standard', charts: [{ id: 'trend', title: '收入趋势', type: 'line', slot: 'sales', x: 'month', y: 'revenue' }], tables: [] }, requirements } }
  const theme = { ...header('visual-theme'), content: { renderer: 'live-dashboard.standard', theme: 'slate' } }
  const task = { ...header('example-task'), dependencies: [
    { ...reference(dataset), kind: dataset.kind, alias: 'data' }, { ...reference(template), kind: template.kind, alias: 'analysis' },
    { ...reference(theme), kind: theme.kind, alias: 'theme' }],
    content: { prompt: '根据提供的示例数据生成收入趋势看板', execution: { mode: 'template', templateAlias: 'analysis' },
      dataAliases: ['data'], themeAlias: 'theme', requirements } }
  return { dataset, template, theme, task, bytes, file,
    package: { roots: [reference(task)], resources: [task, dataset, template, theme], blobs: new Map([[file.sha256, bytes]]) } }
}

// SDK boundary fixture; PostgreSQL integration tests use actual repositories/transactions.
function platform() {
  const state = { files: new Map(), artifacts: new Map(), versions: new Map(), failWrite: false, failDelete: false, writes: 0 }
  const capabilities = {
    'platform.artifacts': {
      async findArtifactBySource(source) { return [...state.artifacts.values()].find(row => JSON.stringify(row.source) === JSON.stringify(source)) ?? null },
      async createArtifact(input) { const row = { ...input, id: randomUUID() }; state.artifacts.set(row.id, row); return row },
      async ensureArtifactVersion(input) {
        let version = [...state.versions.values()].find(row => row.artifactId === input.artifactId && row.idempotencyKey === input.idempotencyKey)
        if (!version) { version = { ...input, id: randomUUID() }; state.versions.set(version.id, version) }
        return { version }
      },
      async readArtifactVersion(input) {
        const version = state.versions.get(input.artifactVersionId)
        if (!version || version.artifactId !== input.artifactId) throw Error('ARTIFACT_DENIED')
        const buffer = state.files.get(version.workspaceFileRef.filePath)
        if (!buffer) throw Error('FILE_MISSING')
        return { version, artifact: state.artifacts.get(input.artifactId), buffer, fileName: version.fileName, mimeType: version.mimeType }
      },
      async deleteArtifact(id) {
        if (state.failDelete) throw Error('DELETE_FAILED')
        state.artifacts.delete(id)
        for (const [key, value] of state.versions) if (value.artifactId === id) state.versions.delete(key)
      }
    },
    'platform.artifact-content': {
      async write({ artifactId, buffer }) {
        state.writes++
        if (state.failWrite) throw Error('UPLOAD_FAILED')
        const filePath = `artifacts/${artifactId}/${sha256(buffer)}`
        state.files.set(filePath, Buffer.from(buffer))
        return { source: 'platform.workspace.files', filePath, workspacePath: filePath }
      }
    },
    'platform.workspace.files': {
      async writeRuntimeBuffer(input) {
        const filePath = `${input.tenantId}/${input.userId}/${input.folder}/${input.fileName}`
        state.files.set(filePath, Buffer.from(input.buffer))
        const reference = { source: 'platform.workspace.files', catalog: input.catalog, tenantId: input.tenantId,
          userId: input.userId, filePath, workspacePath: filePath }
        return { ...reference, reference }
      },
      async readRuntimeBuffer(ref) {
        const buffer = state.files.get(ref.filePath)
        if (!buffer) throw Error('FILE_MISSING')
        return { buffer, reference: ref }
      },
      async deleteFile(ref) { if (state.failDelete) throw Error('DELETE_FAILED'); state.files.delete(ref.filePath) },
      async resolveRuntimeReference(ref) { return ref },
      async resolveFile(ref) { return { ...ref, size: state.files.get(ref.filePath)?.length } },
      async readBuffer(ref) { return { buffer: state.files.get(ref.filePath) } }
    }
  }
  return { state, capabilities, has(token) { return !!capabilities[typeof token === 'string' ? token : token.id] },
    require(token) { const key = token.id, api = capabilities[key]; if (!api) throw Error(`Unknown capability ${key}`); return api } }
}
function services(db, runtime = platform()) {
  const dashboards = {
    async authorizeProject(context) { if (context.denied) throw Error('PROJECT_DENIED') },
    async access(context) { return { canEdit: !context.readonly } }
  }
  const files = new LibraryFilesService(db.getRepository(entities.LibraryFileRecord), runtime)
  const catalog = new LibraryCatalogService(db.getRepository(entities.LibraryVersionRecord), dashboards, files)
  const transfers = new LibraryTransfersService(db.getRepository(entities.LibraryTransferRecord), catalog, runtime)
  const context = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), hostType: 'agent', hostId: randomUUID() }
  return { context, runtime, files, catalog, transfers, dashboards }
}
module.exports = { graph, header, asset, platform, services, entities }
