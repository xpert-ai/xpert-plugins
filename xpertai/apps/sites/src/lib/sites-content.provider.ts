import { mutateSiteCatalog, siteCatalogRevision } from './sites-catalog-lifecycle.js'
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ContentResourceSnapshot, ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { ContentEditorProvider, ContentResourceProvider, ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ContentCatalogProvider, type ContentDocumentScope, type ContentSourceInput, type ContentResourceRequest, type IContentResourceProvider } from '@xpert-ai/plugin-sdk'
import { SitesProject, SitesVersion } from './entities/index.js'
import { assertSitesProject, sitesWhere } from './sites-project-access.js'
import { sourceScope, resolvedSiteSourceRoot, siteSourceRoot, siteSourcePath, readProjectSiteSource, initializeProjectSiteSource } from './sites-project-source.js'
import { SITES_PROVIDER_KEY, SITES_VIEW_KEY, SITES_REMOTE_ENTRY_KEY } from './constants.js'
import type { SitesScope } from './types.js'
import { siteSearchProjection, siteSourceRevision } from './sites-search.js'
export const SITES_CONTENT_PROVIDER = 'sites.content'
const EDITOR = 'sites.editor'
const MODEL = { typeId: 'xpert.site', modelId: 'sites.static-bundle', schemaVersion: '1', editProtocol: { id: 'sites.version.cas', version: '1' } }
const scope = (input: ContentDocumentScope): SitesScope => ({ ...input.actor, hostProjectId: input.projectId, assistantId: input.assistantId })
@Injectable()
@ContentEditorProvider(EDITOR)
export class SitesContentEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: EDITOR, protocolVersion: 2, title: 'Sites',
    view: { providerKey: SITES_PROVIDER_KEY, viewKey: SITES_VIEW_KEY, entry: SITES_REMOTE_ENTRY_KEY }, supports: [{ ...MODEL, access: ['view', 'edit'] }] }
}
@Injectable()
@ContentResourceProvider(SITES_CONTENT_PROVIDER)
export class SitesContentProvider implements IContentResourceProvider {
  readonly title = 'Sites'
  constructor(@InjectRepository(SitesProject) private readonly sites: Repository<SitesProject>,
    @InjectRepository(SitesVersion) private readonly versions: Repository<SitesVersion>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...MODEL, title: { en_US: 'Sites', zh_Hans: '站点' }, implementationKey: 'sites',
      implementationTitle: { en_US: 'Static site', zh_Hans: '静态站点' }, defaultEditorKey: EDITOR,
      templates: [{ id: 'project-brief', title: { en_US: 'Project brief', zh_Hans: '项目介绍' }, description: { en_US: 'A responsive single-page introduction with sections.', zh_Hans: '包含内容分区的自适应单页介绍。' } }]  }],
    discover: async input => {
      const s = scope(input); await assertSitesProject(this.runtime, s, 'read')
      const offset = Number(input.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('SITES_INVALID_CURSOR')
      const rows = await this.sites.find({ where: sitesWhere(s), order: { id: 'ASC' }, skip: offset, take: 100 })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) }
    },
    describe: input => this.describe(input),
    extract: async input => {
      const s = scope(input), site = await this.require(s, input.sourceResourceId)
      const source = await readProjectSiteSource(this.runtime, s, site.id!, site.sourcePath)
      return { ...siteSearchProjection(source), revision: siteCatalogRevision(site, source) }
    },
    mutate: async input => ({ providerKey: SITES_CONTENT_PROVIDER,
      resourceId: await mutateSiteCatalog(this.runtime, this.sites, scope(input), input.sourceResourceId, input.expectedRevision, input.change) }),
    create: async input => {
      if (input.templateId && input.templateId !== 'project-brief') throw new BadRequestException('SITES_TEMPLATE_UNAVAILABLE')
      const s = scope(input); await assertSitesProject(this.runtime, s, 'write')
      await this.sites.createQueryBuilder().insert().values({ id: input.requestId, tenantId: input.actor.tenantId,
        organizationId: input.actor.organizationId, hostProjectId: input.projectId, createdById: input.actor.userId,
        assistantId: input.assistantId, name: input.title, slug: `site-${input.requestId}`, status: 'draft', audience: 'admins_only',
        storageShape: 'static', sourcePath: siteSourceRoot(input.requestId) }).orIgnore().execute()
      await this.require(s, input.requestId)
      await initializeProjectSiteSource(this.runtime, s, input.requestId, input.templateId ? projectBrief(input.title) : undefined)
      return { providerKey: SITES_CONTENT_PROVIDER, resourceId: input.requestId }
    }
  }
  private async require(s: SitesScope, id: string) {
    await assertSitesProject(this.runtime, s, 'read')
    const site = await this.sites.findOneBy({ ...sitesWhere(s), id })
    if (!site) throw new ForbiddenException('SITES_ACCESS_DENIED')
    return site
  }
  async authorize(input: ContentResourceRequest) {
    const site = await this.sites.findOneBy({ id: input.resourceId, tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
    if (!site?.hostProjectId) throw new ForbiddenException('SITES_ACCESS_DENIED')
    const access = await assertSitesProject(this.runtime, { ...input.actor, hostProjectId: site.hostProjectId }, input.operation === 'read' ? 'read' : input.operation === 'manage' ? 'manage' : 'write')
    if (!access) throw new ForbiddenException('SITES_ACCESS_DENIED')
    return { providerKey: SITES_CONTENT_PROVIDER, resourceId: input.resourceId, title: site.name ?? '', role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    const s = scope(input), site = await this.require(s, input.sourceResourceId)
    const source = await readProjectSiteSource(this.runtime, s, site.id!, site.sourcePath)
    return { ...MODEL, offlineAccess: 'project', projectId: input.projectId, title: site.name ?? '', revision: siteCatalogRevision(site, source), updatedAt: site.updatedAt!.toISOString(),
      deleted: site.status === 'archived', preview: { kind: 'outline', revision: siteCatalogRevision(site, source), lines: [site.name ?? '', ...source.files.map(file => file.path)].slice(0, 6).map(line => line.slice(0, 160)) }, source: { kind: 'bundle', rootPath: resolvedSiteSourceRoot(site.id!, site.sourcePath), entryPath: 'index.html' }, defaultEditorKey: EDITOR, sourceSync: { status: 'synced', revision: siteCatalogRevision(site, source) }, allowedActions: [
        ...(site.status !== 'archived' ? ['rename' as const, 'duplicate' as const] : []),
        ...((await assertSitesProject(this.runtime, s, 'read'))?.canManage ? [site.status === 'archived' ? 'restore' as const : 'trash' as const] : [])
      ] }
  }
  async readSource(s: SitesScope, id: string) { const site = await this.require(s, id); return readProjectSiteSource(this.runtime, s, id, site.sourcePath) }
  async writeSource(s: SitesScope, id: string, path: string, content: string, expectedHash: string | null) {
    await assertSitesProject(this.runtime, s, 'write'); const site = await this.require(s, id)
    if (site.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
    // Serialize native file edits with version snapshots. File hash CAS also protects external writers.
    return this.sites.manager.transaction(async manager => {
      const current = await manager.getRepository(SitesProject).findOneOrFail({ where: { ...sitesWhere(s), id }, lock: { mode: 'pessimistic_write' } })
      if (current.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
      return this.runtime.require(ProjectFilesRuntimeCapability).write({ ...sourceScope(s), path: siteSourcePath(id, path, current.sourcePath), buffer: Buffer.from(content), expectedHash })
    })
  }
}

/** Authored template content, separate from Remote View UI and never executed in the library. */
function projectBrief(title: string) {
  const safe = title.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe}</title><style>body{font:1rem/1.6 system-ui;margin:0 auto;padding:3rem 1.5rem;max-width:60rem}header,section,footer{padding:2rem 0;border-bottom:1px solid #ddd}h1{font-size:clamp(2rem,5vw,4rem)}</style></head><body><header><h1>${safe}</h1></header><main><section id="overview"><p></p></section><section id="details"><p></p></section></main><footer></footer></body></html>`
}
