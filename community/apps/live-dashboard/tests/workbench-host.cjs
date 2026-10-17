/* Representative View Host for the production bundle. It deliberately does not simulate authentication. */
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const sourceId = '22222222-2222-4222-8222-222222222222'
const scope = { tenantId: 'tenant', organizationId: 'organization', userId: 'viewer', hostType: 'agent', hostId: 'assistant', slots: [] }
const artifacts = new Map(), files = new Map(), versions = new Map(), drafts = new Map()
const receipts = { queries: 0, parameters: [], saves: 0, selection: null }
const manifest = require('../examples/postgres-sales.json')
const source = { id: sourceId, name: 'Acceptance sales', type: 'pg', providers: [] }
const capabilities = {
  'platform.datasource.analytics': {
    async list() { return [source] },
    async query(actor, request) {
      if (actor.userId !== scope.userId) throw new Error('Forbidden')
      const parameters = resolveAnalyticsParameters(request.binding, request.controls)
      receipts.queries++; receipts.parameters.push(parameters)
      const rows = [{ region: 'east', amount: 120 }, { region: 'west', amount: 80 }].filter((row) => parameters.region === 'all' || row.region === parameters.region)
      return normalizeAnalyticsResult(request.binding, { rows, columns: [{ key: 'region' }, { key: 'amount' }],
        completeness: { returnedRows: rows.length, totalRows: rows.length, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false }, sourceFetchedAt: new Date().toISOString() }, randomUUID(), 1000)
    }
  },
  'platform.workspace.files': {
    async uploadBuffer(input) { const filePath = `${input.folder}/${input.fileName}`; files.set(filePath, Buffer.from(input.buffer)); return { filePath, workspacePath: `/workspace/${filePath}` } },
    async readBuffer(reference) { return { buffer: files.get(reference.filePath) } }
  },
  'platform.artifact-drafts': {
    async list(ids) { return [...drafts.values()].filter(draft => ids.includes(draft.artifactId)) },
    async get(id) { return drafts.get(id) ?? null },
    async save(input) {
      const artifact = artifacts.get(input.artifactId), previous = drafts.get(artifact.id)
      if ((previous?.revision ?? 0) !== input.expectedRevision || (artifact.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('DRAFT_CONFLICT')
      const draft = { ...input, id: previous?.id ?? randomUUID(), revision: input.expectedRevision + 1, baseVersionId: input.expectedCurrentVersionId,
        publishedRevision: previous?.publishedRevision ?? null, publishedVersionId: previous?.publishedVersionId ?? null }
      drafts.set(artifact.id, draft); receipts.saves++
      return draft
    },
    async publish(input) {
      const draft = drafts.get(input.artifactId)
      if (draft.revision !== input.expectedRevision) throw Error('DRAFT_CONFLICT')
      const { version } = await capabilities['platform.artifacts'].ensureArtifactVersion({ ...draft, ...input, idempotencyKey: `draft:${draft.revision}` })
      draft.baseVersionId = version.id; draft.publishedRevision = draft.revision; draft.publishedVersionId = version.id
      return version
    }
  },
  'platform.artifacts': {
    async listArtifacts() { return { items: [...artifacts.values()], total: artifacts.size, page: 1, pageSize: 100 } },
    async findArtifactBySource(input) { return [...artifacts.values()].find((artifact) => artifact.resourceId === input.resourceId) ?? null },
    async createArtifact(input) { const artifact = { id: randomUUID(), ...input.source, ...input.scope, title: input.title, kind: input.kind, status: 'active' }; artifacts.set(artifact.id, artifact); return artifact },
    async ensureArtifactVersion(input) {
      const artifact = artifacts.get(input.artifactId)
      const existing = [...versions.values()].find((version) => version.artifactId === artifact.id && version.idempotencyKey === input.idempotencyKey)
      if ((artifact.currentVersionId ?? null) !== input.expectedCurrentVersionId && existing?.id !== artifact.currentVersionId) throw new Error('ARTIFACT_VERSION_CONFLICT')
      const version = existing ?? { id: randomUUID(), artifactId: artifact.id, versionNumber: [...versions.values()].filter((version) => version.artifactId === artifact.id).length + 1,
        status: 'active', idempotencyKey: input.idempotencyKey, sha256: input.sha256, mimeType: input.mimeType, title: input.title, workspaceFileRef: input.workspaceFileRef }
      versions.set(version.id, version); artifact.currentVersionId = version.id; artifact.currentVersion = version; receipts.saves++
      return { version, outcome: existing ? 'reused' : 'created' }
    },
    async getArtifact(id) { return artifacts.get(id) },
    async listArtifactVersions({ artifactId }) { return [...versions.values()].filter((version) => version.artifactId === artifactId) }
  }
}
const runtime = { require(key) { const api = capabilities[key.id]; if (!api) throw new Error(`Missing capability ${key.id}`); return api } }
const service = new DashboardService(runtime, { async validate(_context, manifest) { if (manifest.presentation) throw Error('HTML validation requires the real Sandbox Jobs host'); return null } })
const provider = new DashboardViewProvider(service)
const host = `<!doctype html><html><head><meta charset="utf-8"><title>Live Dashboard acceptance host</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head><body><iframe id="view" title="Dashboard workbench" src="/view" sandbox="allow-scripts"></iframe><script>
const frame=document.getElementById('view');const instanceId='acceptance-host';
function send(message){frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId,...message},'*')}
window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow||event.origin!=='null'||event.data.channel!=='xpertai.remote_component')return;const message=event.data;
if(message.type==='ready'){send({type:'init',locale:'zh-Hans',theme:{mode:'light',density:'default',tokens:{}},manifest:{},payload:{}});return}
if(message.instanceId!==instanceId||!['requestData','executeAction','invokeClientCommand'].includes(message.type))return;
try{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});const data=await response.json();if(!response.ok)throw new Error(data.message);send({type:message.type==='requestData'?'data':'actionResult',requestId:message.requestId,data})}catch(error){send({type:'error',requestId:message.requestId,message:error.message})}})
</script></body></html>`
const server = http.createServer(async (request, response) => {
  try {
    response.setHeader('Cache-Control', 'no-store')
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(host); return }
    if (request.url === '/view') { response.setHeader('Content-Type', 'text/html'); response.end((await provider.getRemoteComponentEntry()).html); return }
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/manifest') { response.end(JSON.stringify(manifest)); return }
    if (request.url === '/state') { response.end(JSON.stringify({ ...receipts, artifacts: [...artifacts.values()], versions: versions.size, storedManifests: [...files.values()].map((buffer) => JSON.parse(buffer.toString())) })); return }
    if (request.url === '/rpc' && request.method === 'POST') {
      const chunks = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 600000) throw new Error('Too large'); chunks.push(chunk) }
      const message = JSON.parse(Buffer.concat(chunks).toString())
      if (message.type === 'invokeClientCommand') {
        if (message.commandKey !== 'assistant.context.set' || message.payload.key !== 'live_dashboard') throw Error('Unsupported command')
        receipts.selection = message.payload.context
        response.end(JSON.stringify({ success: true })); return
      }
      const result = message.type === 'requestData' ? await provider.getViewData(scope, 'live-dashboard', message.query) : await provider.executeViewAction(scope, 'live-dashboard', message.actionKey, { input: message.input })
      response.end(JSON.stringify(result)); return
    }
    response.statusCode = 404; response.end('{}')
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ message: error.message })) }
})
server.listen(Number(process.env.PORT ?? 4317), '127.0.0.1', () => console.log(`Acceptance host: http://127.0.0.1:${server.address().port}`))
