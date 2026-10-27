import { presentationRevision, isPresentationActive } from './presentation-lifecycle.js'
import { persistPresentationSource, presentationSourceRoot } from './presentation-source.js'
import { PRESENTATION_STANDARD_DECK_KIND } from './presentation-theme-preview.contract.js'
import { ForbiddenException, Inject, Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { PresentationCatalogService } from './presentation-catalog.service.js'
import { STUDIO_SHELL_PROP } from './presentation-studio-shell.js'
import type { ContentResourceSnapshot, ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { ContentResourceProvider, ContentEditorProvider, ProjectAccessRuntimeCapability, ProjectFilesRuntimeCapability,
  WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type IContentResourceProvider,
  type ContentResourceRequest, type ContentDocumentScope, type ContentSourceInput, type ContentCatalogProvider } from '@xpert-ai/plugin-sdk'
import { PresentationDeck, PresentationAsset } from './entities/index.js'
import { createPresentationYDoc, encodeYDoc, materializePresentationYDoc } from './presentation-yjs.js'
import { PRESENTATION_PROVIDER_KEY, PRESENTATION_VIEW_KEY, PRESENTATION_REMOTE_ENTRY_KEY } from './constants.js'
import { PresentationStudioService } from './presentation-studio.service.js'
import type { PresentationDeckSpec } from './types.js'
import { presentationSearchProjection } from './presentation-search.js'

export const PRESENTATION_CONTENT_PROVIDER = 'presentation-studio.content'
const MODEL = { typeId: 'xpert.presentation', modelId: 'presentation-studio.deck', schemaVersion: '2', editProtocol: { id: 'presentation-studio.yjs', version: '2' } }
const EDITOR = 'presentation-studio.editor'
@Injectable()
@ContentEditorProvider(EDITOR)
export class PresentationContentEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: EDITOR, protocolVersion: 2, title: 'Presentation Studio',
    view: { providerKey: PRESENTATION_PROVIDER_KEY, viewKey: PRESENTATION_VIEW_KEY, entry: PRESENTATION_REMOTE_ENTRY_KEY }, supports: [{ ...MODEL, access: ['view', 'edit'] }] }
}

/** Adapter over the native Deck and its one existing Yjs stream; never a second document model. */
@Injectable()
@ContentResourceProvider(PRESENTATION_CONTENT_PROVIDER)
export class PresentationContentProvider implements IContentResourceProvider {
  readonly title = 'Presentation Studio'
  constructor(@InjectRepository(PresentationDeck) private readonly decks: Repository<PresentationDeck>,
    @InjectRepository(PresentationAsset) private readonly assets: Repository<PresentationAsset>,
    private readonly service: PresentationStudioService, private readonly layouts: PresentationCatalogService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...MODEL, title: { en_US: 'Slides', zh_Hans: '幻灯片' }, implementationKey: 'presentation-studio',
      implementationTitle: { en_US: 'Presentation Studio', zh_Hans: '演示文稿工作室' }, defaultEditorKey: EDITOR,
      templates: [{ id: 'five-slide-outline', title: { en_US: 'Five-slide outline', zh_Hans: '五页演示框架' }, description: { en_US: 'Five editable layouts, ready for your content.', zh_Hans: '五页可编辑布局，填入你的内容即可。' } }]  }],
    discover: async input => {
      await this.access(input)
      const offset = Number(input.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('PRESENTATION_INVALID_CURSOR')
      const rows = await this.decks.find({ where: this.where(input), order: { id: 'ASC' }, skip: offset, take: 100 })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) }
    },
    describe: input => this.describe(input),
    reconcile: async input => {
      await this.access(input, true)
      await persistPresentationSource(this.runtime, this.decks, this.assets, { ...input.actor, projectId: input.projectId }, input.sourceResourceId)
      if ((await this.describe(input)).sourceSync?.status !== 'synced') throw new BadRequestException('PRESENTATION_SOURCE_NOT_SYNCED')
    },
    extract: async input => {
      await this.access(input)
      const deck = await this.decks.findOneBy({ ...this.where(input), id: input.sourceResourceId })
      if (!deck || !isPresentationActive(deck)) throw new ForbiddenException('PRESENTATION_ACCESS_DENIED')
      const fields = Object.fromEntries(await Promise.all((deck.deckSpec?.slides ?? []).map(async slide => {
        const layout = await this.layouts.requireLayout(slide.layout, deck.themePack)
        return [slide.layout, (layout.freeTextFields ?? []).filter((field): field is string => typeof field === 'string')]
      })))
      return presentationSearchProjection(deck, fields)
    },
    create: async input => {
      await this.access(input, true)
      if (input.templateId && input.templateId !== 'five-slide-outline') throw new BadRequestException('PRESENTATION_TEMPLATE_UNAVAILABLE')
      const pageCount = input.templateId ? 5 : 3
      const spec: PresentationDeckSpec = { kind: PRESENTATION_STANDARD_DECK_KIND, title: input.title, goal: input.title, themePack: 'theme01',
        pageCount, preview: { autosave: false, themeSwitcher: false },
        slides: (await this.layouts.scaffoldLayouts({ theme: 'theme01', pageCount, seed: input.requestId }))
          .map(layout => ({ id: randomUUID(), layout, status: 'active', props: { [STUDIO_SHELL_PROP]: true } })) }
      const doc = createPresentationYDoc(spec), encoded = encodeYDoc(doc)
      // requestId is a create-only identity. Concurrent retries never save over an existing Deck.
      await this.decks.createQueryBuilder().insert().values({ ...this.where(input), id: input.requestId, title: input.title,
        goal: input.title, themePack: 'theme01', status: 'draft', revision: 0, currentVersionNumber: 0, deckSpec: () => ':deckSpec',
        editorState: () => ':editorState', yjsStateBase64: encoded.stateBase64,
        yjsStateVectorBase64: encoded.stateVectorBase64, yjsUpdateCount: 0, checksum: createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
        createdById: input.actor.userId, lastEditedById: input.actor.userId, lastEditedAt: new Date() }).setParameters({ deckSpec: JSON.stringify(spec), editorState: JSON.stringify(materializePresentationYDoc(doc).editorState) }).orIgnore().execute()
      doc.destroy()
      await this.describe({ ...input, sourceResourceId: input.requestId })
      await persistPresentationSource(this.runtime, this.decks, this.assets, { ...input.actor, projectId: input.projectId }, input.requestId)
      return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: input.requestId }
    },
    mutate: async input => {
      await this.access(input, true)
      if (input.change.action === 'duplicate') {
        const existing = await this.decks.findOneBy({ ...this.where(input), id: input.change.requestId })
        if (existing) {
          if (existing.copiedFromId !== input.sourceResourceId) throw new BadRequestException('PRESENTATION_SOURCE_REQUEST_CONFLICT')
          return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: existing.id! }
        }
        const copyScope = { ...input.actor, projectId: input.projectId, assistantId: input.assistantId }
        const exported = await this.service.exportSource(copyScope, input.sourceResourceId, Number(input.expectedRevision.split(':')[0]))
        // Source recovery assigns independent assets and a fresh CRDT history. It does
        // not copy published versions, share tokens or the original collaboration room.
        const result = await this.service.importSource(copyScope, input.change.requestId, Buffer.from(exported.contentBase64, 'base64'),
          { sourceId: input.sourceResourceId, title: input.change.title })
        return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: result.deckId }
      }
      if (input.change.action === 'trash' || input.change.action === 'restore') {
        await this.service.setRecycled({ ...input.actor, projectId: input.projectId, assistantId: input.assistantId }, input.sourceResourceId, input.expectedRevision, input.change.action === 'trash')
        return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: input.sourceResourceId }
      }
      if (input.change.action !== 'rename') throw new BadRequestException('PRESENTATION_ACTION_UNAVAILABLE')
      await this.service.renameDeck({ ...input.actor, projectId: input.projectId, assistantId: input.assistantId }, input.sourceResourceId,
        input.change.title, Number(input.expectedRevision.split(':')[0]))
      return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: input.sourceResourceId }
    }
  }
  private where(input: ContentDocumentScope) { return { tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, projectId: input.projectId } }
  private async access(input: ContentDocumentScope, write = false) {
    const projects = this.runtime.require(ProjectAccessRuntimeCapability)
    const access = input.assistantId ? await projects.assertAssistant({ ...input, assistantId: input.assistantId })
      : (await projects.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
    if (!access) throw new ForbiddenException('PRESENTATION_ACCESS_DENIED')
    if (write) await projects.assertEdit(input)
    return access
  }
  async authorize(input: ContentResourceRequest) {
    const deck = await this.decks.findOneBy({ id: input.resourceId, tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
    if (!deck?.projectId) throw new ForbiddenException('PRESENTATION_ACCESS_DENIED')
    const access = await this.access({ actor: input.actor, projectId: deck.projectId }, input.operation !== 'read')
    return { providerKey: PRESENTATION_CONTENT_PROVIDER, resourceId: input.resourceId, title: deck.title, role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    const access = await this.access(input)
    const deck = await this.decks.findOneBy({ ...this.where(input), id: input.sourceResourceId })
    if (!deck) throw new ForbiddenException('PRESENTATION_ACCESS_DENIED')
    // Catalog cards show the native layout's human-readable name, never its
    // implementation key. Preview only visible slides and keep the work bounded.
    const previewLayouts = await Promise.all(deck.deckSpec.slides
      .filter(slide => slide.status === 'active')
      .slice(0, 5).map(slide => this.layouts.requireLayout(slide.layout, deck.themePack)))
    const previewLines = [deck.title, ...previewLayouts.map(layout => layout.label)]
      .filter((line): line is string => typeof line === 'string' && !!line.trim()).map(line => line.slice(0, 160))
    return { ...MODEL, offlineAccess: 'project', projectId: input.projectId, title: deck.title, revision: presentationRevision(deck), updatedAt: deck.updatedAt!.toISOString(),
      deleted: !isPresentationActive(deck), source: !!deck.sourceSnapshotPath ? { kind: 'bundle', rootPath: presentationSourceRoot(deck.id!), entryPath: deck.sourceSnapshotPath!.slice(presentationSourceRoot(deck.id!).length + 1) } : { kind: 'managed' },
      preview: { kind: 'outline', revision: presentationRevision(deck), lines: previewLines },
      containedPaths: [{ path: `files/presentation-studio/${deck.id}/assets`, recursive: true }],
      sourceSync: { status: deck.sourceSyncFailed ? 'failed' : deck.sourceRevision === deck.revision ? 'synced' : 'pending', ...(!!deck.sourceSnapshotPath ? { revision: String(deck.sourceRevision) } : {}) }, defaultEditorKey: EDITOR, allowedActions: [
        ...(isPresentationActive(deck) ? ['rename' as const, 'duplicate' as const] : []),
        ...(access.canManage ? [deck.lifecycleState === 'archiving' ? 'trash' as const : isPresentationActive(deck) ? 'trash' as const : 'restore' as const] : [])
      ] }
  }
}
