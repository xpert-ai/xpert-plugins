import { ArtifactReferenceDialog, openArtifactReference } from './artifact-reference'
import { UnavailableContent } from './unavailable-content'
import { EditorPreferences } from './editor-preferences'
import { CatalogMoveDialog, CatalogLifecycleDialog, CatalogRenameDialog, CatalogCreateDialog, catalogItem, catalogPageSchema, implementationSchema, useCatalogLabel, openCatalogItem, type Implementation } from './catalog'
import { t, useLocale, i18n, useMessage } from './i18n'
import { Card, CardHeader, CardContent, CardFooter, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { SourceDialog } from './source-dialog'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { z } from 'zod/v3'
import {
  Button, Input, InputGroup, InputGroupAddon, InputGroupInput, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
  FileText, Folder, Files, Search, Plus, ChevronDown, Trash2, LockKeyhole, ArrowLeft, MessageSquare,
  History, MoreHorizontal, WandSparkles, X, RefreshCw, Info, Download
} from '@xpert-ai/plugin-shadcn-ui'
import { action, connect, data, setAssistantContext, openDocument } from './bridge'
import { DownloadButton } from './download'
import { CreateDialog } from './create-dialog'
import { MaterialsDialog } from './materials-dialog'
import { KnowledgePanel } from './panels'
import { listSchema, artifactTypeName, errorText, dateText, kindName, type Item } from './model'

const Icon = ({ kind }: { kind?: string }) => kind === 'folder' ? <Folder /> : <FileText />
function App() {
  useLocale()
  const label = useCatalogLabel()
  const [implementations, setImplementations] = useState<Implementation[]>([])
  const [resources, setResources] = useState<Item[]>([]), [moreResources, setMoreResources] = useState(false)
  const [lifecycleResource, setLifecycleResource] = useState<{ item: Item; operation: 'trash' | 'restore' } | null>(null)
  const [movingResource, setMovingResource] = useState<Item | null>(null)
  const [renamingResource, setRenamingResource] = useState<Item | null>(null)
  const [duplicatingResource, setDuplicatingResource] = useState<Item | null>(null)
  const [artifactReference, setArtifactReference] = useState<string | null>(null)
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [creatingResource, setCreatingResource] = useState<Implementation | null>(null)
  // The menu item unmounts before Dialog opens. Return focus to its persistent trigger.
  const createTrigger = useRef<HTMLButtonElement>(null)
  const [root, setRoot] = useState<Item | null>(null), [items, setItems] = useState<Item[]>([])
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [compact, setCompact] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null), [folderId, setFolderId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all'), [search, setSearch] = useState(''), [trash, setTrash] = useState(false)
  const [permissions, setPermissions] = useState({ canWrite: false, canManage: false })
  const [requiresProject, setRequiresProject] = useState(false), [loading, setLoading] = useState(true)
  const [editors, setEditors] = useState<Array<{ key: string; title: string }>>([])
  const [saved, setSaved] = useState(true)
  const [error, setError] = useMessage(''), [busy, setBusy] = useState(false), [editorKey, setEditorKey] = useState(0)
  const [unavailableContent, setUnavailableContent] = useState<Item | null>(null)
  const [editorPreferences, setEditorPreferences] = useState<Item | null>(null)
  const [panel, setPanel] = useState<'knowledge' | null>(null), [modal, setModal] = useState<string | null>(null)
  // Open after the menu releases its focus scope inside the remote iframe.
  const openDialog = (name: string) => { window.setTimeout(() => setModal(name), 0) }
  const { canWrite, canManage } = permissions
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await work() } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  const load = useCallback(async (deleted = false) => {
    setLoading(true)
    try {
      const raw = await data({ selectionId: 'root', parameters: { trash: deleted } })
      if (z.object({ meta: z.object({ requiresProject: z.literal(true) }) }).safeParse(raw).success) {
        setRequiresProject(true); setRoot(null); setItems([]); setResources([]); setImplementations([]); return false
      }
      const response = listSchema.parse(raw).meta
      setRequiresProject(false); setRoot(response.root); setItems(response.items); setPermissions(response); setTrash(deleted)
      setImplementations(z.array(implementationSchema).parse(await action('catalog.types', {})))
      return true
    } finally { setLoading(false) }
  }, [])
  const reload = async () => { await load(trash) }
  // Filter and paginate at the platform catalog, not over the first browser page.
  // A late response from an old search must not replace the current collection.
  const catalogRequest = useRef(0)
  const resourceQuery = { ...(folderId ? { parentId: folderId } : {}), deleted: trash, search, ...(filter === 'files' ? { typeId: 'xpert.artifact' } : !['all', 'page'].includes(filter) ? { typeId: filter } : {}) }
  useEffect(() => {
    const request = ++catalogRequest.current
    setResources([]); setMoreResources(false)
    if (!root || filter === 'page') return
    const timeout = window.setTimeout(() => {
      void action('catalog.list', resourceQuery).then(raw => {
        if (request !== catalogRequest.current) return
        const page = catalogPageSchema.parse(raw)
        setResources(page.items.map(catalogItem)); setMoreResources(page.hasMore)
      }).catch(error => { if (request === catalogRequest.current) setError(errorText(error)) })
    }, search ? 200 : 0)
    return () => { window.clearTimeout(timeout); catalogRequest.current++ }
  }, [root, folderId, filter, search, trash])

  useEffect(() => connect((query) => {
    setCompact(z.object({ parameters: z.object({ presentation: z.literal('navigation') }) }).safeParse(query).success)
    setSelected(null); setSaved(true); setError(''); setPanel(null)
    void load().then(async (ready) => {
      if (ready) setEditors(z.array(z.object({ key: z.string(), title: z.string() })).parse(await action('editor.list', {})))
    }).catch((error) => setError(errorText(error)))
  }), [load])
  useEffect(() => {
    if (!root) return
    void setAssistantContext({ key: 'spaces', context: { spaceId: root.id, itemId: selected?.id, filePath: selected?.filePath,
      title: selected?.title, kind: selected?.kind, saved } }).catch(() => undefined)
    return () => { void setAssistantContext({ key: 'spaces', clear: true }).catch(() => undefined) }
  }, [root?.id, selected?.id, saved])
  function choose(item: Item | null) {
    if (item?.availability === 'provider-unavailable') { setUnavailableContent(item); return }
    if (!saved) { setError(i18n.message('navigation.waitForSave')); return }
    if (item?.presentation?.kind === 'artifact' && !item.deleted) {
      void run(() => openArtifactReference(item.presentation!.referenceId).then(() => undefined)); return
    }
    if (item?.editorKey && !item.deleted) {
      void run(async () => {
        try { await (item.kind === 'resource' ? openCatalogItem(item.id) : openDocument(item.id, 'spaces')) }
        catch (error) { setSelected(item); throw error }
      })
      return
    }
    if (item?.kind === 'folder') { setFolderId(item.id); setSelected(null); setPanel(null) }
    else { setSelected(item); setEditorKey((key) => key + 1) }
  }
  function navigate(next: string, folder: string | null = null) {
    if (!saved) return
    setSelected(null); setFolderId(folder); setFilter(next); setPanel(null)
    if (trash) void run(() => load(false))
  }
  const visible = [...items, ...resources].filter((item) => (!folderId || item.parentId === folderId) &&
    (filter === 'all' || (filter === 'page' ? item.kind === 'page' : filter === 'files' ? ['file', 'artifact'].includes(item.kind ?? '') || item.presentation?.kind === 'artifact' : item.resourceTypeId === filter)) &&
    (item.title + ' ' + (item.filePath ?? '')).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const typeTitle = implementations.find(item => item.typeId === filter)?.title
  const heading = typeTitle ? label(typeTitle) : trash ? t('navigation.trash') : folderId ? items.find((item) => item.id === folderId)?.title ?? t('kind.folder') : filter === 'page' ? t('kind.page') : filter === 'files' ? t('navigation.files') : t('navigation.all')
  const itemActions = (item: Item) => <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('library.moreActions', { title: item.title })}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {item.presentation?.kind === 'artifact' && !item.deleted && <DropdownMenuItem onSelect={() => window.setTimeout(() => setArtifactReference(item.presentation!.referenceId), 0)}>{t('artifact.manage')}</DropdownMenuItem>}
              {!item.deleted && <DropdownMenuItem onSelect={() => choose(item)}>{t('common.open')}</DropdownMenuItem>}
              {item.kind === 'resource' && (item.compatibleEditors?.length ?? 0) > 1 && <>
                <DropdownMenuLabel>{t('catalog.openWith')}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => window.setTimeout(() => setEditorPreferences(item), 0)}>{t('catalog.editorDefaults')}</DropdownMenuItem>
                {item.compatibleEditors?.map(editor => <DropdownMenuItem key={editor.key} onSelect={() => void run(() => openCatalogItem(item.id, editor.key).then(() => undefined))}>{editor.title}</DropdownMenuItem>)}
                <DropdownMenuSeparator />
              </>}
              {item.kind === 'resource' && (['trash', 'restore'] as const).filter(operation => item.allowedActions?.includes(operation) && (operation === 'restore' ? item.deleted : !item.deleted)).map(operation =>
                <DropdownMenuItem key={operation} onSelect={() => window.setTimeout(() => setLifecycleResource({ item, operation }), 0)}>{operation === 'trash' ? t('trash.move') : t('trash.restore')}</DropdownMenuItem>)}
              {item.kind === 'resource' && !item.deleted && item.canWrite && <DropdownMenuItem onSelect={() => window.setTimeout(() => setMovingResource(item), 0)}>{t('catalog.move')}</DropdownMenuItem>}
              {item.kind === 'resource' && item.allowedActions?.includes('rename') && <DropdownMenuItem onSelect={() => window.setTimeout(() => setRenamingResource(item), 0)}>{t('catalog.rename')}</DropdownMenuItem>}
              {item.kind === 'resource' && item.allowedActions?.includes('duplicate') && <DropdownMenuItem onSelect={() => window.setTimeout(() => setDuplicatingResource(item), 0)}>{t('catalog.duplicate')}</DropdownMenuItem>}
              {item.importOrigin && <DropdownMenuItem onSelect={() => { setEditingItem(item); openDialog('origin') }}>{t('source.viewOrigin')}</DropdownMenuItem>}
              {item.kind !== 'resource' && canWrite && !trash && <DropdownMenuItem onSelect={() => { setEditingItem(item); openDialog('edit') }}>{t('document.renameMove')}</DropdownMenuItem>}
              {item.kind !== 'resource' && canManage && <DropdownMenuItem onSelect={() => void run(async () => { await action('item.edit', { itemId: item.id, expectedVersion: item.version, deleted: !trash }); await reload() })}>{trash ? t('trash.restore') : t('trash.move')}</DropdownMenuItem>}
            </DropdownMenuContent></DropdownMenu>
  const itemState = (item: Item) => <div className="flex flex-wrap gap-2" title={item.sourceSync?.revision ? t('catalog.sourceRevision', { revision: item.sourceSync.revision }) : undefined}>
    <Badge variant="outline">{item.presentation?.kind === 'artifact' ? t('artifact.referenceAccess') : item.canWrite === false ? t('catalog.readOnly') : t('catalog.projectAccess')}</Badge>
    {item.sourceSync && <Badge variant={item.sourceSync.status === 'failed' ? 'destructive' : 'secondary'}>{t(({ synced: 'catalog.synced', pending: 'catalog.pending', failed: 'catalog.failed' } as const)[item.sourceSync.status])}</Badge>}
  </div>
  return <div className={`app ${compact ? 'compact-navigation' : ''}`}>
    {error && <div className="notice" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label={t('common.dismiss')} onClick={() => setError('')}><X /></Button></div>}
    {busy && <div className="progress-message" role="status">{t('common.processing')}</div>}
    {requiresProject ? <main className="project-empty"><Folder /><h1>{t('project.choose')}</h1><p>{t('project.chooseDescription')}</p><p className="muted">{t('project.sharing')}</p><Button variant="outline" onClick={() => void run(() => load())}><RefreshCw />{t('common.reload')}</Button></main> :
    <div className="body">
      <aside className="tree" aria-label={t('navigation.label')}>
        <div className="space-name"><h2>{t('space.title')}</h2><Button variant="ghost" size="icon" aria-label={t('navigation.search')} onClick={() => document.getElementById('space-search')?.focus()}><Search /></Button></div>
        <p className="space-subtitle">{root?.title ?? t('common.opening')}{t('space.sharedSuffix')}</p>
        {compact && <><Input aria-label={t('navigation.findDocument')} placeholder={t('navigation.findDocument')} value={search} onChange={(event) => setSearch(event.target.value)} /><div className="compact-documents">{visible.filter((item) => item.kind === 'page').map((item) => <Button type="button" variant="ghost" key={item.id} className="nav-item" title={item.filePath ?? item.title} onClick={() => choose(item)}><FileText /><span className="truncate">{item.title}</span></Button>)}</div></>}
        <nav>{[['all', t('navigation.all')], ['page', t('kind.page')], ['files', t('navigation.files')], ...Array.from(new Map(implementations.map(item => [item.typeId, [item.typeId, label(item.title)]])).values())].map(([key, title]) => <Button type="button" variant={!selected && !folderId && !trash && filter === key ? 'secondary' : 'ghost'} key={key} className={!selected && !folderId && !trash && filter === key ? 'nav-item selected' : 'nav-item'} onClick={() => navigate(key)} disabled={!saved}>
          {key === 'all' ? <Files /> : key === 'page' ? <FileText /> : <Folder />}{title}</Button>)}</nav>
        <p className="nav-label">{t('kind.folder')}</p>
        <div className="folder-tree">{items.filter((item) => item.kind === 'folder' && !item.deleted)
          .sort((a, b) => (a.filePath ?? a.title).localeCompare(b.filePath ?? b.title)).map((item) => <React.Fragment key={item.id}>
          <Button type="button" variant={folderId === item.id && !selected ? 'secondary' : 'ghost'} className={`nav-item ${folderId === item.id && !selected ? 'selected' : ''}`} title={item.filePath ?? item.title} style={{ paddingLeft: `calc(var(--spacing) * ${3 + Math.min(4, (item.filePath?.split('/').length ?? 1) - 1) * 4.5})` }} onClick={() => navigate('all', item.id)} disabled={!saved}><Folder /><span className="truncate">{item.title}</span></Button>
          {selected && selected.parentId === item.id && <Button type="button" variant="secondary" className="nav-item selected nested" onClick={() => choose(selected)}><FileText />{selected.title}</Button>}
        </React.Fragment>)}</div>
        <div className="nav-bottom"><Button type="button" variant="ghost" className={`nav-item ${panel === 'knowledge' ? 'selected' : ''}`} onClick={() => setPanel('knowledge')}><Search />{t('knowledge.title')}</Button>
          {canManage && <Button type="button" variant="ghost" className={`nav-item ${trash ? 'selected' : ''}`} disabled={!saved} onClick={() => void run(async () => { setSelected(null); setFolderId(null); setPanel(null); await load(!trash) })}><Trash2 />{t('navigation.trash')}</Button>}</div>
      </aside>
      <main className={`workspace ${selected ? 'document-workspace' : ''}`}>
        {selected ? <>
          <header className="document-bar"><Button variant="ghost" size="icon" aria-label={t('navigation.back')} onClick={() => choose(null)}><ArrowLeft /></Button>
            <span className="breadcrumb">{selected.filePath?.split('/').slice(0, -1).join(' / ') || t('navigation.all')}</span>
            <span className="save-state">{saved ? canWrite ? t('editor.saved') : t('editor.readOnly') : t('editor.saving')}</span>
            <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t('document.actions')}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {selected.kind !== 'resource' && canWrite && <DropdownMenuItem disabled={!saved} onSelect={() => { setEditingItem(selected); openDialog('edit') }}>{t('document.renameMove')}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => openDialog('access')}>{t('access.title')}</DropdownMenuItem>
              {selected.kind !== 'resource' && canManage && <DropdownMenuItem disabled={!saved} onSelect={() => void run(async () => {
                await action('item.edit', { itemId: selected.id, expectedVersion: selected.version, deleted: !trash }); choose(null); await reload()
              })}>{trash ? t('trash.restore') : t('trash.move')}</DropdownMenuItem>}
            </DropdownMenuContent></DropdownMenu>
          </header>
          <article className="document-canvas"><h1>{selected.title}</h1><p className="document-meta">{dateText(selected.updatedAt)}{t('document.projectFileSuffix')}</p>
            {trash ? <p className="empty-message">{t('trash.documentNotice')}</p> : <>
              {selected.editorKey && <div className="file-preview"><FileText /><p>{t('document.editorUnavailable')}</p><Button variant="outline" onClick={() => choose(selected)}>{t('document.reopenEditor')}</Button></div>}
              {!selected.editorKey && <div className="file-preview"><Icon kind={selected.kind} /><p>{selected.filePath ?? selected.title}</p><p className="muted">{t('document.originalFormat')}</p></div>}
              {selected.kind !== 'resource' && <div className="document-download"><DownloadButton fileKey={`item:${selected.id}`} onError={(error) => setError(errorText(error))}><Download />{t('document.download')}</DownloadButton></div>}
            </>}
          </article>
        </> : <>
          <header className="library-header"><div><h1>{heading}</h1><p>{t('library.description')}</p></div>
            {/* Keep access alongside the other actions, even when the header wraps in a split Workbench. */}
            <div className="library-actions"><InputGroup className="library-search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput id="space-search" aria-label={t('library.search')} placeholder={t('library.search')} value={search} onChange={(event) => setSearch(event.target.value)} /></InputGroup>
              <Button variant="outline" onClick={() => setModal('access')}><LockKeyhole />{t('access.title')}</Button>
              {canWrite && !trash && <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button ref={createTrigger}><Plus />{t('library.new')}<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-64">
                <DropdownMenuItem onSelect={() => openDialog('page')}>{t('kind.page')}</DropdownMenuItem><DropdownMenuItem onSelect={() => openDialog('folder')}>{t('kind.folder')}</DropdownMenuItem>
                {implementations.filter((value, index, all) => all.findIndex(candidate => candidate.typeId === value.typeId) === index).map(implementation => <DropdownMenuItem key={`${implementation.providerKey}/${implementation.implementationKey}`} onSelect={() => window.setTimeout(() => setCreatingResource(implementation), 0)}>{label(implementation.title)}{label(implementation.title) !== label(implementation.implementationTitle) && <> · {label(implementation.implementationTitle)}</>}</DropdownMenuItem>)}
                {editors.map((editor) => <DropdownMenuItem key={editor.key} onSelect={() => openDialog(editor.key)}>{editor.title}</DropdownMenuItem>)}
                <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openDialog('materials')}>{t('materials.title')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openDialog('source')}>{t('source.title')}</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>}
            </div>
          </header>
          <div className="list-toolbar"><span>{t('library.recent')}</span><div className="flex items-center gap-2"><Button variant={layout === 'list' ? 'secondary' : 'ghost'} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>{t('library.listView')}</Button><Button variant={layout === 'grid' ? 'secondary' : 'ghost'} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>{t('library.gridView')}</Button><Button variant="ghost" size="icon" aria-label={t('library.refresh')} disabled={busy || loading} onClick={() => void run(reload)}><RefreshCw /></Button></div></div>
          {loading ? <div className="empty-message" role="status">{t('library.loading')}</div> : <div className="table-scroll">{layout === 'grid' ? <div className="grid gap-4 p-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))' }}>
            {visible.map(item => <Card key={item.id}><CardHeader><div className="flex items-center justify-between gap-2"><Button variant="ghost" className="min-w-0" onClick={() => choose(item)}><Icon kind={item.kind} /><span className="truncate">{item.title}</span></Button>{itemActions(item)}</div></CardHeader>
              <CardContent>{item.presentation?.kind === 'artifact' && <Badge variant="secondary" className="mb-2">{artifactTypeName(item.presentation.type)}</Badge>}<div className="aspect-video overflow-hidden" aria-label={t('catalog.outlinePreview')}>
                {item.preview && item.preview.revision === item.resourceRevision ? <ol>{item.preview.lines.map((line, index) => <li className="truncate" key={index}>{line}</li>)}</ol> : <Icon kind={item.kind} />}
              </div>{itemState(item)}</CardContent><CardFooter>{dateText(item.updatedAt)}</CardFooter></Card>)}
          </div> : <Table className="library-table"><TableHeader><TableRow><TableHead>{t('common.name')}</TableHead><TableHead>{t('library.type')}</TableHead><TableHead>{t('library.source')}</TableHead><TableHead>{t('library.updated')}</TableHead><TableHead>{t('library.state')}</TableHead><TableHead><span className="sr-only">{t('library.actions')}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visible.map((item) => <TableRow key={item.id}><TableCell><Button type="button" variant="ghost" className="file-title" onClick={() => choose(item)}><span className={`file-icon ${item.kind}`}><Icon kind={item.kind} /></span><span><strong>{item.title}</strong><small>{item.parentPageId && items.some((parent) => parent.id === item.parentPageId && !parent.deleted) ? t('library.subpage', { title: items.find((parent) => parent.id === item.parentPageId)?.title ?? '' }) : (item.kind === 'resource' ? items.find(folder => folder.id === item.parentId)?.filePath ?? items.find(folder => folder.id === item.parentId)?.title : item.filePath?.split('/').slice(0, -1).join(' / ')) || t('folder.root')}</small></span></Button></TableCell><TableCell>{item.presentation?.kind === 'artifact' ? artifactTypeName(item.presentation.type) : item.resourceTypeId ? label(implementations.find(type => type.typeId === item.resourceTypeId)?.title ?? { en_US: item.resourceTypeId, zh_Hans: item.resourceTypeId }) : kindName(item.kind)}</TableCell><TableCell>{item.presentation?.kind === 'artifact' ? t('artifact.referenceType') : item.kind === 'resource' ? t('catalog.resource') : item.importOrigin ? t('source.copyType') : item.kind === 'page' ? t('library.spacePage') : item.kind === 'artifact' ? t('materials.assistantArtifacts') : t('library.projectFile')}</TableCell><TableCell>{dateText(item.updatedAt)}</TableCell><TableCell>{itemState(item)}</TableCell><TableCell>{itemActions(item)}</TableCell></TableRow>)}</TableBody></Table>}
            {!visible.length && <div className="empty-message"><FileText /><h2>{search ? t('library.noResults') : trash ? t('trash.empty') : t('library.empty')}</h2><p>{search ? t('library.searchHint') : t('library.createHint')}</p>{canWrite && !trash && !search && <Button onClick={() => setModal('page')}><Plus />{t('create.page')}</Button>}</div>}
          </div>}
          {moreResources && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const request = catalogRequest.current; const page = catalogPageSchema.parse(await action('catalog.list', { ...resourceQuery, offset: resources.length })); if (request !== catalogRequest.current) return; setResources(previous => [...previous, ...page.items.map(catalogItem)]); setMoreResources(page.hasMore) })}>{t('catalog.more')}</Button>}
          <p className="library-footnote"><Info />{t('library.storageNote')}</p>
        </>}
      </main>
      {panel === 'knowledge' && <aside className="panel" aria-label={t('knowledge.title')}><header><h2>{t('knowledge.title')}</h2><Button variant="ghost" size="icon" aria-label={t('common.closePanel')} onClick={() => setPanel(null)}><X /></Button></header>
        {root && <KnowledgePanel root={root} canWrite={canWrite} canManage={canManage} run={run} busy={busy} />}
      </aside>}
    </div>}
    {artifactReference && <ArtifactReferenceDialog referenceId={artifactReference} onClose={() => setArtifactReference(null)} onChanged={reload} />}
    {unavailableContent && <UnavailableContent item={unavailableContent} onClose={() => setUnavailableContent(null)} run={run} busy={busy} />}
    {editorPreferences && <EditorPreferences item={editorPreferences} onClose={() => setEditorPreferences(null)} run={run} busy={busy} />}
    {lifecycleResource && <CatalogLifecycleDialog {...lifecycleResource} busy={busy} run={run} onClose={() => setLifecycleResource(null)} onDone={reload} />}
    {movingResource && <CatalogMoveDialog item={movingResource} items={items} onClose={() => setMovingResource(null)} onDone={reload} run={run} busy={busy} />}
    {duplicatingResource && <CatalogRenameDialog item={duplicatingResource} duplicate busy={busy} run={run} onClose={() => setDuplicatingResource(null)} onDone={reload} />}
    {renamingResource && <CatalogRenameDialog item={renamingResource} busy={busy} run={run} onClose={() => setRenamingResource(null)} onDone={reload} />}
    {creatingResource && <CatalogCreateDialog implementations={implementations} items={items} initialParent={folderId} implementation={creatingResource} onClose={() => setCreatingResource(null)} onDone={reload} run={run} busy={busy} />}
    {root && modal && (modal === 'page' || modal === 'folder' || modal === 'edit' || editors.some((editor) => editor.key === modal)) && <CreateDialog root={root} items={items} initialParent={folderId ?? ''} kind={modal} editors={editors} editing={modal === 'edit' ? editingItem ?? undefined : undefined}
      onClose={() => setModal(null)} onDone={async (item) => { await reload(); choose(item) }} run={run} busy={busy} />}
    {root && modal === 'materials' && <MaterialsDialog root={root} items={items} parentId={folderId ?? ''} editors={editors} onClose={() => setModal(null)} onDone={reload} run={run} busy={busy} />}
    {root && modal === 'source' && <SourceDialog spaceId={root.id} parentId={folderId} destination={t('source.destination', { space: root.title, folder: items.find((item) => item.id === folderId)?.title ?? t('folder.root') })} onClose={() => setModal(null)} onDone={reload} returnFocus={() => createTrigger.current?.focus()} />}
    {modal === 'origin' && editingItem?.importOrigin && <Dialog open onOpenChange={() => setModal(null)}><DialogContent className="space-dialog">
      <DialogHeader><DialogTitle>{t('source.originTitle')}</DialogTitle><DialogDescription>{t('source.copyDescription')}</DialogDescription></DialogHeader>
      <p>{t('source.originRevision', { provider: editingItem.importOrigin.provider, revision: editingItem.importOrigin.revision })}</p><p>{t('source.importedAt', { date: dateText(editingItem.importOrigin.importedAt) })}</p>
      <p className="break-all text-sm">{t('source.id', { id: editingItem.importOrigin.documentId })}</p>
      {editingItem.importOrigin.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      {editingItem.importOrigin.url && <a className="underline" href={editingItem.importOrigin.url} target="_blank" rel="noopener noreferrer">{t('source.openPlatform')}</a>}
      <Button onClick={() => setModal(null)}>{t('common.close')}</Button>
    </DialogContent></Dialog>}
    {modal === 'access' && <Dialog open onOpenChange={() => setModal(null)}><DialogContent className="space-dialog capability-dialog">
      <DialogHeader><DialogTitle>{t('space.title')}</DialogTitle><DialogDescription>{t('access.description')}</DialogDescription></DialogHeader>
      <section><h2>{t('access.entry')}</h2><p className="row"><Files />{t('common.workbench')} <span className="muted">/</span>{t('access.views')}<span className="muted">/</span>{t('space.title')}</p><p className="muted">{t('access.entryDescription')}</p></section>
      <section><h2>{t('access.title')}</h2><p className="row"><LockKeyhole /><strong>{t('access.shared')}</strong></p><p>{t('access.roles')}</p><p className="muted">{t('access.projectPermissions')}</p></section>
      <section><h2>{t('access.capabilities')}</h2><ul className="capability-list">
        <li><FileText /><strong>{t('access.pages')}</strong><span>{t('access.pagesDescription')}</span></li>
        <li><WandSparkles /><strong>{t('access.ai')}</strong><span>{t('access.aiDescription')}</span></li>
        <li><Folder /><strong>{t('navigation.files')}</strong><span>{t('access.filesDescription')}</span></li>
        <li><Search /><strong>{t('knowledge.title')}</strong><span>{t('access.searchDescription')}</span></li>
      </ul><p className="muted text-sm">{t('access.sheetDescription')}</p></section>
      <DialogFooter><span className="muted"><Info />{t('library.storageNote')}</span><Button onClick={() => setModal(null)}>{t('common.done')}</Button></DialogFooter>
    </DialogContent></Dialog>}
  </div>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
