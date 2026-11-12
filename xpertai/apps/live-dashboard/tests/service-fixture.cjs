const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { DashboardSharingService } = require('../dist/lib/sharing.service.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const example = require('../examples/postgres-sales.json')

function setup() {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', hostType: 'agent', hostId: 'assistant' }
  const files = new Map(), artifacts = new Map(), versions = [], drafts = new Map(), links = new Map()
  const sources = [{ source: example.bindings[0].source, providers: [{ id: example.bindings[0].providerId }] }]
  const calls = { queries: [], denied: false, rejectFilter: false, invalidHtml: false, failUpload: false }
  const capabilities = {
    'platform.analytics': {
      async list() { await calls.onSources?.(); return sources },
      async query(actor, input) {
        calls.queries.push({ actor, input })
        if (calls.denied) throw new Error('SOURCE_ACCESS_REVOKED')
        const { region } = resolveAnalyticsParameters(input.binding, input.controls)
        if (calls.rejectFilter && region !== 'all') throw (calls.filterError ?? new Error('NATIVE_FILTER_TYPE_INVALID'))
        const rows = [{ region: 'east', amount: 120 }, { region: 'west', amount: 80 }].filter(row => region === 'all' || row.region === region)
        return normalizeAnalyticsResult(input.binding, { columns: [{ key: 'region' }, { key: 'amount' }], rows,
          sourceFetchedAt: new Date().toISOString(), completeness: { returnedRows: rows.length, totalRows: rows.length,
            totalAccuracy: 'exact', scope: 'full_query_result', truncated: false } }, randomUUID(), 1000)
      }
    },
    'platform.artifact-content': {
      async write({ artifactId, buffer }) {
        if (calls.failUpload) throw Error('UPLOAD_FAILED')
        const filePath = `.apps/artifact_content/${artifactId}/${require('node:crypto').createHash('sha256').update(buffer).digest('hex')}`
        files.set(filePath, Buffer.from(buffer)); return { source: 'platform.workspace.files', filePath, workspacePath: filePath }
      }
    },
    'platform.workspace.files': {
      async uploadBuffer(input) {
        if (calls.failUpload) throw Error('UPLOAD_FAILED')
        assert.equal(input.mimeType, 'application/json', 'must use a platform-supported Artifact MIME type')
        const filePath = input.folder + '/' + input.fileName
        files.set(filePath, Buffer.from(input.buffer)); return { filePath }
      },
      async readBuffer(ref) { return { buffer: files.get(ref.filePath) } }
    },
    'platform.artifact-drafts': {
      async list(ids) { return [...drafts.values()].filter(draft => ids.includes(draft.artifactId)) },
      async get(id) { return drafts.get(id) ?? null },
      async save(input) {
        const a = artifacts.get(input.artifactId), previous = drafts.get(a.id)
        if ((previous?.revision ?? 0) !== input.expectedRevision || (a.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('DRAFT_CONFLICT')
        const draft = { ...input, id: previous?.id ?? randomUUID(), revision: input.expectedRevision + 1, baseVersionId: input.expectedCurrentVersionId,
          publishedRevision: previous?.publishedRevision ?? null, publishedVersionId: previous?.publishedVersionId ?? null }
        drafts.set(a.id, draft); return draft
      },
      async publish(input) {
        const draft = drafts.get(input.artifactId), a = artifacts.get(input.artifactId)
        if (draft.revision !== input.expectedRevision) throw Error('DRAFT_CONFLICT')
        if (draft.publishedRevision === draft.revision) return versions.find(v => v.id === draft.publishedVersionId)
        if ((a.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('VERSION_CONFLICT')
        const version = { ...draft, id: randomUUID(), versionNumber: versions.length + 1 }
        versions.push(version); a.currentVersion = version; a.currentVersionId = version.id
        draft.publishedRevision = draft.revision; draft.publishedVersionId = version.id; draft.baseVersionId = version.id
        return version
      }
    },
    'platform.artifacts': {
      async getArtifactShare({ artifactId, shareKey }) { assert.equal(shareKey, 'team-readonly'); return links.get(artifactId) ?? null },
      async ensureArtifactShare(input) {
        const link = { ...input, status: 'active', presentationUrl: `https://platform.test/artifacts/view/${randomUUID()}` }
        links.set(input.artifactId, link); return { link }
      },
      async revokeArtifactShare({ artifactId }) { links.get(artifactId).status = 'revoked' },
      async listArtifacts() { return { items: [...artifacts.values()] } },
      async findArtifactBySource(source) { return [...artifacts.values()].find(a => a.resourceId === source.resourceId) },
      async createArtifact(input) { assert.deepEqual(input.type, { pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard' }); const a = { id: randomUUID(), status: 'active', ...input.source, ...input.scope, title: input.title, metadata: input.metadata }; artifacts.set(a.id, a); return a },
      async getArtifact(id) { return artifacts.get(id) },
      async listArtifactVersions({ artifactId }) { return versions.filter(v => v.artifactId === artifactId) },
      async ensureArtifactVersion(input) {
        const a = artifacts.get(input.artifactId)
        const current = versions.find(v => v.id === a.currentVersionId)
        if (current?.idempotencyKey === input.idempotencyKey) return { version: current, outcome: 'reused' }
        assert.equal(input.expectedCurrentVersionId, a.currentVersionId ?? null, 'CAS expectation must reach platform')
        const version = { ...input, id: randomUUID(), versionNumber: versions.length + 1 }
        versions.push(version); a.currentVersion = version; a.currentVersionId = version.id
        return { version, outcome: 'created' }
      }
    }
  }
  const runtime = { require: key => capabilities[key.id] }
  const service = new DashboardService(runtime, { async validate(_context, manifest) { if (manifest.presentation && calls.invalidHtml) throw Error('DASHBOARD_HTML_PREFLIGHT_FAILED'); return manifest.presentation ? { status: 'passed', jobId: 'test-job', requestedBindings: manifest.bindings.map(b => b.id) } : null } })
  return { capabilities, context, files, artifacts, versions, drafts, links, sources, calls, service, sharing: new DashboardSharingService(service, runtime) }
}

module.exports = { setup }
