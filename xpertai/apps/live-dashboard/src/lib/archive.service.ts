import { DashboardSaveRequests } from './save-requests'
import { MAX_DASHBOARD_BINDINGS } from './capacity'
import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { analyticsSourceRefSchema, analyticsOptionsSchema, analyticsBindingObjectSchema } from '@xpert-ai/plugin-sdk/analytics'
import { DashboardService, projectId } from './dashboard.service'
import { dashboardSchema } from './dashboard.schema'
import { encodeDashboardArchive, decodeDashboardArchive, dashboardRequirements } from './dashboard-archive'
import { encodeDashboardPackage } from './document-package'

export const importInputSchema = z.object({ importId: z.string().uuid(),
  bindings: z.array(z.object({ bindingId: z.string(), source: analyticsSourceRefSchema, payload: analyticsBindingObjectSchema.shape.payload }).strict()).max(MAX_DASHBOARD_BINDINGS)
}).strict()
const importBrowseSchema = z.object({ importId: z.string().uuid(), bindingId: z.string(), source: analyticsSourceRefSchema, request: analyticsOptionsSchema.default({}) }).strict()
type ImportInput = z.infer<typeof importInputSchema>
type Receipt = Awaited<ReturnType<DashboardService['save']>>
type Session = ReturnType<typeof decodeDashboardArchive> & { scope: string; created: number; newId: string; busy: boolean; submitted?: { hash: string; requestId: string }; committed?: { hash: string; receipt: Receipt } }

@Injectable()
export class DashboardArchiveService {
  private readonly imports = new Map<string, Session>()
  constructor(private readonly dashboards: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, @Optional() private readonly saves?: DashboardSaveRequests) {}
  private async authorize(context: XpertResolvedViewHostContext) {
    if (!(await this.dashboards.access(context)).canEdit) throw new ForbiddenException('DASHBOARD_DEFINITION_ACCESS_DENIED')
  }
  private session(context: XpertResolvedViewHostContext, id: string) {
    const session = this.imports.get(id)
    if (!session || session.scope !== importScope(context) || Date.now() - session.created > 30 * 60_000) throw new BadRequestException('DASHBOARD_IMPORT_EXPIRED')
    return session
  }
  async prepare(context: XpertResolvedViewHostContext, bytes: Buffer) {
    await this.authorize(context)
    const document = decodeDashboardArchive(bytes)
    for (const [key, session] of this.imports) if (Date.now() - session.created > 30 * 60_000) this.imports.delete(key)
    if (this.imports.size >= 16) throw new BadRequestException('DASHBOARD_IMPORT_LIMIT')
    const importId = randomUUID()
    this.imports.set(importId, { ...document, scope: importScope(context), created: Date.now(), newId: randomUUID(), busy: false })
    return { importId, manifest: document.manifest, requirements: dashboardRequirements(document.manifest), sources: await this.dashboards.sources(context) }
  }
  async browse(context: XpertResolvedViewHostContext, input: z.infer<typeof importBrowseSchema>) {
    await this.authorize(context)
    const session = this.session(context, input.importId)
    const binding = session.manifest.bindings.find(item => item.id === input.bindingId)
    if (!binding) throw new BadRequestException('DASHBOARD_BINDING_DENIED')
    return this.dashboards.discover(context, { source: input.source, providerId: binding.providerId, request: input.request })
  }
  async commit(context: XpertResolvedViewHostContext, input: ImportInput) {
    await this.authorize(context)
    const session = this.session(context, input.importId)
    if (session.busy) throw new BadRequestException('DASHBOARD_IMPORT_RUNNING')
    if (new Set(input.bindings.map(item => item.bindingId)).size !== input.bindings.length || input.bindings.some(item => !session.manifest.bindings.some(binding => binding.id === item.bindingId)))
      throw new BadRequestException('DASHBOARD_IMPORT_BINDINGS_INVALID')
    const manifest = dashboardSchema.parse({ ...session.manifest, id: session.newId,
      bindings: session.manifest.bindings.map(binding => {
        const replacement = input.bindings.find(item => item.bindingId === binding.id)
        return replacement ? { ...binding, source: replacement.source, payload: replacement.payload } : binding
      }) })
    const hash = createHash('sha256').update(encodeDashboardPackage(manifest, session.dependencies)).digest('hex')
    if (session.submitted && this.saves) {
      if (session.submitted.hash !== hash) throw new BadRequestException('DASHBOARD_IMPORT_ALREADY_SUBMITTED')
      return this.saves.get(context, session.submitted.requestId)
    }
    if (session.committed) {
      if (session.committed.hash !== hash) throw new BadRequestException('DASHBOARD_IMPORT_ALREADY_COMPLETED')
      // Revalidate ownership and current access before returning an idempotent receipt.
      await this.dashboards.open(context, session.committed.receipt.artifactId)
      return session.committed.receipt
    }
    session.busy = true
    try {
      if (this.saves && manifest.bindings.length > 8) {
        const request = await this.saves.submit(context, manifest, null, 0, `import/${input.importId}/${hash}`, undefined, session.dependencies)
        session.submitted = { hash, requestId: request.requestId }
        return request
      }
      const receipt = await this.dashboards.save(context, manifest, null, 0, session.dependencies)
      session.committed = { hash, receipt }
      return receipt
    } finally { session.busy = false }
  }
  async discard(context: XpertResolvedViewHostContext, id: string) {
    await this.authorize(context)
    const session = this.session(context, id)
    if (session.busy) throw new BadRequestException('DASHBOARD_IMPORT_RUNNING')
    this.imports.delete(id)
    return { discarded: true }
  }
  async exportFile(context: XpertResolvedViewHostContext, fileKey: string) {
    await this.authorize(context)
    const match = /^archive\/([a-f0-9-]{36})\/(draft|version)\/([a-f0-9-]+)$/.exec(fileKey)
    if (!match) throw new BadRequestException('DASHBOARD_EXPORT_TARGET_INVALID')
    const artifactId = z.string().uuid().parse(match[1])
    const versionId = match[2] === 'version' ? z.string().uuid().parse(match[3]) : undefined
    const revision = match[2] === 'draft' ? z.coerce.number().int().positive().parse(match[3]) : undefined
    const saved = await this.dashboards.openDocument(context, artifactId, versionId, revision, versionId ? 'published' : 'draft')
    const buffer = encodeDashboardArchive(saved.manifest, saved.dependencies)
    const fileName = `${saved.manifest.title.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 100)}.xpert-dashboard.zip`
    const project = projectId(context), hash = createHash('sha256').update(buffer).digest('hex')
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId,
      ...(project ? { catalog: 'projects' as const, scopeId: project, projectId: project } : { catalog: 'xperts' as const, scopeId: context.hostId, xpertId: context.hostId }) }
    const uploaded = await this.runtime.require(WorkspaceFilesRuntimeCapability).uploadBuffer({ ...scope, buffer, originalName: fileName,
      fileName: `${hash}.zip`, folder: `dashboards/exports/${artifactId}`, mimeType: 'application/zip' })
    const reference: WorkspacePortableFileReference = { ...scope, source: 'platform.workspace.files', filePath: uploaded.filePath,
      workspacePath: uploaded.filePath, originalName: fileName, mimeType: 'application/zip', size: buffer.length }
    return { reference, fileName, mimeType: 'application/zip', size: buffer.length }
  }
}
export { importBrowseSchema }
function importScope(context: XpertResolvedViewHostContext) {
  return JSON.stringify([context.tenantId, context.organizationId, context.userId, context.hostType, context.hostId, projectId(context)])
}
