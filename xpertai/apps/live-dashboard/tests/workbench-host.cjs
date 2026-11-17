/* Representative View Host for the production bundle. It deliberately does not simulate authentication. */
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { DashboardArchiveService } = require('../dist/lib/archive.service.js')
const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
const { DashboardSharingService } = require('../dist/lib/sharing.service.js')
const { DashboardProjectsService } = require('../dist/lib/projects.service.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const hostType = process.env.DASHBOARD_HOST_TYPE ?? 'agent'
if (!['agent', 'project'].includes(hostType)) throw Error('Unsupported fixture host')
const scope = { tenantId: 'tenant', organizationId: 'organization', userId: 'viewer', hostType, hostId: randomUUID(), slots: [] }
const projects = Array.from({ length: 25 }, (_, index) => ({ projectId: randomUUID(), name: `项目 ${String(index + 1).padStart(2, '0')} · 项目名称很长时也应保持完整的布局与清晰的选择`, role: 'owner', canManage: true, archived: false }))
scope.runtimeScope = { projectId: projects[0].projectId, ...(process.env.DASHBOARD_FIXTURE_SHARED === 'true' ? { conversationId: randomUUID() } : {}) }
const shared = { resource: { kind: 'group-reference', id: randomUUID() }, title: '库存透视 · 授权共享看板', typeId: 'xpert.live-dashboard', projectId: projects[0].projectId, publication: { versionId: randomUUID(), versionNumber: 1, expiresAt: '2099-01-01T00:00:00Z' }, access: { canOpen: true, canEdit: false, analysis: 'none' } }
function projectAccess({ actor, projectId }) {
  const project = projects.find(item => item.projectId === projectId)
  if (!project || actor.tenantId !== scope.tenantId || actor.organizationId !== scope.organizationId || actor.userId !== scope.userId) throw Error('PROJECT_ACCESS_DENIED')
  return project
}
const artifacts = new Map(), files = new Map(), versions = new Map(), drafts = new Map()
const links = new Map()
const receipts = { queries: 0, parameters: [], saves: 0, selection: null, navigation: [], hostType, hostId: scope.hostId }
const manifest = require('../examples/postgres-sales.json')
const source = { source: manifest.bindings[0].source, name: 'Acceptance sales', providers: [{ id: manifest.bindings[0].providerId, operations: [{ name: manifest.bindings[0].operation, contractVersion: 1 }] },
  { id: 'private-provider', operations: [], sharing: { mode: 'owner_only', reasonCode: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' } }] }
const capabilities = {
  'platform.content.resources': { discovery: { async list(input, query) {
    const items = []
    if (query.origin !== 'shared') {
      const context = { ...scope, hostType: 'project', hostId: input.projectId, runtimeScope: undefined }
      const page = await service.listPage(context, 1, 100)
      items.push(...page.items.map(dashboard => ({ resource: { kind: 'project-content', id: dashboard.artifactId }, title: dashboard.title,
        projectId: input.projectId, typeId: 'xpert.live-dashboard', contentSource: { providerKey: 'live-dashboard.content', resourceId: dashboard.artifactId }, access: { canOpen: true, canEdit: true, analysis: 'none' } })))
    }
    const sharedAvailable = !!input.conversationId && input.projectId === shared.projectId
    if (sharedAvailable && query.origin !== 'project') items.push(shared)
    const filtered = items.filter(item => !query.search || item.title.includes(query.search))
    const offset = Number(query.cursor ?? 0), end = offset + query.limit
    return { items: filtered.slice(offset, end), nextCursor: filtered.length > end ? String(end) : null, sharedAvailable }
  } } },
  'platform.project.access': {
    async listReadable({ projectIds }) { return projects.filter(item => !projectIds || projectIds.includes(item.projectId)) },
    async assertAssistant(input) { if (input.assistantId !== scope.hostId) throw Error('ASSISTANT_DENIED'); return projectAccess(input) },
    async assertEdit(input) { return projectAccess(input) },
    async assertManage(input) { return projectAccess(input) }
  },
  'platform.analytics': {
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
    'platform.artifact-content': {
      async write({ artifactId, buffer }) {

        const filePath = `.apps/artifact_content/${artifactId}/${require('node:crypto').createHash('sha256').update(buffer).digest('hex')}`
        files.set(filePath, Buffer.from(buffer)); return { source: 'platform.workspace.files', filePath, workspacePath: filePath }
      }
    },
  'platform.workspace.files': {
    async uploadBuffer(input) { const filePath = `${input.folder}/${input.fileName}`; files.set(filePath, Buffer.from(input.buffer)); return { filePath, workspacePath: `/workspace/${filePath}` } },
    async readBuffer(reference) { return { buffer: files.get(reference.filePath) } }
  },
  'platform.artifact-drafts': {
    async list(ids) { return [...drafts.values()].filter(draft => ids.includes(draft.artifactId)) },
    async get(id) { return drafts.get(id) ?? null },
    async setRecycled({ artifactId, expectedRevision, recycled }) {
      const draft = drafts.get(artifactId), artifact = artifacts.get(artifactId)
      if (draft?.revision !== expectedRevision) throw Error('ARTIFACT_DRAFT_CONFLICT')
      artifact.status = recycled ? 'archived' : 'active'; draft.revision++
      if (recycled && links.has(artifactId)) links.get(artifactId).status = 'revoked'
      return draft
    },
    async save(input) {
      const artifact = artifacts.get(input.artifactId), previous = drafts.get(artifact.id)
      if ((previous?.revision ?? 0) !== input.expectedRevision || (artifact.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('DRAFT_CONFLICT')
      const draft = { ...input, updatedAt: '2026-11-02T08:30:00Z', id: previous?.id ?? randomUUID(), revision: input.expectedRevision + 1, baseVersionId: input.expectedCurrentVersionId,
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
    async getArtifactShare({ artifactId }) { return links.get(artifactId) ?? null },
    async ensureArtifactShare(input) {
      const previous = links.get(input.artifactId)
      if (previous?.status === 'active' && previous.versionMode === input.versionMode && previous.artifactVersionId === input.artifactVersionId) return { link: previous }
      const link = { ...input, status: 'active', presentationUrl: `https://platform.test/artifacts/view/${randomUUID()}` }
      links.set(input.artifactId, link); return { link }
    },
    async revokeArtifactShare({ artifactId }) { const link = links.get(artifactId); if (link) link.status = 'revoked' },
    async listArtifacts({ status, resourceIdPrefix, page = 1, pageSize = 100 }) {
      const items = [...artifacts.values()].filter(artifact => artifact.status === status && artifact.resourceId.startsWith(resourceIdPrefix))
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }
    },
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
const service = new DashboardService(runtime, { async validate(_context, manifest) { if (manifest.presentation && process.env.DASHBOARD_FIXTURE_HTML !== 'true') throw Error('HTML validation requires the real Sandbox Jobs host'); return null } })
const provider = new DashboardViewProvider(service, new DashboardSharingService(service, runtime), new DashboardProjectsService(runtime), new DashboardArchiveService(service, runtime))
const host = `<!doctype html><html><head><meta charset="utf-8"><title>Live Dashboard acceptance host</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head><body><iframe id="view" title="Dashboard workbench" src="/view" sandbox="allow-downloads allow-forms allow-modals allow-popups allow-scripts"></iframe><script>
const frame=document.getElementById('view');const instanceId='acceptance-host';
function send(message){frame.contentWindow.postMessage({channel:'xpertai.remote_component',protocolVersion:1,instanceId,...message},'*')}
window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow||event.origin!=='null'||event.data.channel!=='xpertai.remote_component')return;const message=event.data;
if(message.type==='ready'){send({type:'init',locale:'zh-Hans',theme:{mode:'light',density:'default',tokens:{}},manifest:{},payload:{}});return}
if(message.instanceId!==instanceId||!['requestData','executeAction','invokeClientCommand','executeFileAction','requestFileAccess'].includes(message.type))return;
try{if(message.file?.buffer)message.file.bytes=Array.from(new Uint8Array(message.file.buffer));const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});const data=await response.json();if(message.commandKey==='workbench.navigation.open' && (message.payload.target==='assistant.project' || message.payload.viewKey==='live-dashboard__live-dashboard'))send({type:'init',locale:'zh-Hans',initialQuery:{selectionId:message.payload.selectionId,parameters:message.payload.parameters}});if(!response.ok)throw new Error(data.message);send({type:message.type==='requestData'?'data':'actionResult',requestId:message.requestId,data})}catch(error){send({type:'error',requestId:message.requestId,message:error.message})}})
</script></body></html>`
const server = http.createServer(async (request, response) => {
  try {
    response.setHeader('Cache-Control', 'no-store')
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(host); return }
    if (request.url === '/view') { response.setHeader('Content-Type', 'text/html'); response.end((await provider.getRemoteComponentEntry()).html); return }
    response.setHeader('Content-Type', 'application/json')
    if (request.url.startsWith('/download?')) { const bytes = files.get(new URL(request.url, 'http://fixture').searchParams.get('path')); if (!bytes) throw Error('Missing fixture file'); response.setHeader('Content-Type', 'application/zip'); response.end(bytes); return }
    if (request.url === '/manifest') { response.end(JSON.stringify(manifest)); return }
    if (request.url === '/state') { response.end(JSON.stringify({ ...receipts, projects, projectId: scope.runtimeScope.projectId, links: [...links.values()], artifacts: [...artifacts.values()], versions: versions.size, storedManifests: [...files.entries()].filter(([name]) => !name.endsWith('.zip')).map(([,buffer]) => JSON.parse(buffer.toString())) })); return }
    if (request.url === '/rpc' && request.method === 'POST') {
      const chunks = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 20_000_000) throw new Error('Too large'); chunks.push(chunk) }
      const message = JSON.parse(Buffer.concat(chunks).toString())
      if (message.type === 'invokeClientCommand') {
        if (message.commandKey === 'workbench.content.resolve') {
          if (!artifacts.has(message.payload.resourceId)) throw Error('Unknown content')
          response.end(JSON.stringify({ success: true, navigation: { target: 'workbench.view', viewKey: 'live-dashboard__dashboard', selectionId: message.payload.resourceId, parameters: { contentId: message.payload.resourceId } } })); return
        }
        if (message.commandKey === 'workbench.resource.open') {
          if (message.payload.kind !== 'group-reference' || message.payload.id !== shared.resource.id || scope.runtimeScope.projectId !== shared.projectId) throw Error('Unknown group reference')
          receipts.navigation.push(message.payload); response.end(JSON.stringify({ success: true })); return
        }
        if (message.commandKey === 'workbench.navigation.open') {
          const target = message.payload
          if (target.target === 'assistant.project' && projects.some(item => item.projectId === target.projectId)) scope.runtimeScope.projectId = target.projectId
          else if (target.target !== (hostType === 'project' ? 'assistant.project' : 'workbench.view') ||
            (hostType === 'project' ? target.projectId !== scope.hostId : target.projectId !== undefined)) throw Error('Wrong dashboard navigation host')
          receipts.navigation.push(target)
          response.end(JSON.stringify({ success: true })); return
        }
        if (message.commandKey !== 'assistant.context.set' || message.payload.key !== 'live_dashboard') throw Error('Unsupported command')
        receipts.selection = message.payload.context
        response.end(JSON.stringify({ success: true })); return
      }
      if (message.type === 'executeFileAction') {
        const file = { buffer: Buffer.from(message.file.bytes), originalName: message.file.name, mimeType: message.file.type, size: message.file.size }
        response.end(JSON.stringify(await provider.executeViewFileAction(scope, 'live-dashboard', message.actionKey, { input: message.input }, file))); return
      }
      if (message.type === 'requestFileAccess') {
        const file = await provider.resolveViewFile(scope, 'live-dashboard', message)
        response.end(JSON.stringify({ fileName: file.fileName, url: `http://127.0.0.1:${server.address().port}/download?path=${encodeURIComponent(file.reference.filePath)}` })); return
      }
      const result = message.type === 'requestData' ? await provider.getViewData(scope, 'live-dashboard', message.query) : await provider.executeViewAction(scope, 'live-dashboard', message.actionKey, { input: message.input })
      response.end(JSON.stringify(result)); return
    }
    response.statusCode = 404; response.end('{}')
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ message: error.message })) }
})
server.listen(Number(process.env.PORT ?? 4317), '127.0.0.1', () => console.log(`Acceptance host: http://127.0.0.1:${server.address().port}`))
