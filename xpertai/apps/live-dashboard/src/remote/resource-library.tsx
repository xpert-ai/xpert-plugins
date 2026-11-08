import * as React from 'react'
import { Button, Input, Tabs, TabsList, TabsTrigger, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Search, Upload, RefreshCw } from '@xpert-ai/plugin-shadcn-ui'
import { kindSchema, type ResourceDocumentV2 } from '../lib/library/resource-contract'
import { directoryQuerySchema, type DirectoryItem } from '../lib/library/directory-contract'
import { type LibraryData, type libraryQuerySchema } from '../lib/library.schema'
import type { z } from 'zod/v3'
import { i18n, type messages } from './i18n'
import { useResourceTask } from './library-gateway'
import { useDirectory, DirectoryGallery } from './library-directory'
import { ResourceDetail } from './resource-detail'
import { ResourceImport } from './resource-import'
import { catalogCategories, categoryKeys } from './library-catalog'

type T = ReturnType<typeof messages>
export type LibraryParameters = NonNullable<z.output<typeof libraryQuerySchema>['parameters']>
export function ResourceLibrary({ t, data, initialKind, initialAudience, initial = {}, onQuery, embedded = false }: {
  t: T; data: LibraryData; initialKind: ResourceDocumentV2['kind']; initialAudience?: 'mine'|'public'; initial?: LibraryParameters;
  onQuery?(parameters: LibraryParameters): void; embedded?: boolean; busy?: boolean; error?: string; run?(work: () => Promise<void>): void
}) {
  const [kind, setKind] = React.useState(initial.catalogKind ?? initialKind), [audience, setAudience] = React.useState(initial.catalogAudience ?? initialAudience ?? (initialKind === 'public-dataset' ? 'public' : 'catalog'))
  const [search, setSearch] = React.useState(initial.search ?? ''), [searchDraft, setSearchDraft] = React.useState(initial.search ?? '')
  const [category, setCategory] = React.useState(initial.category ?? ''), [appearance, setAppearance] = React.useState(initial.appearance ?? 'all')
  const [page, setPage] = React.useState(initial.catalogPage ?? 1), [revision, setRevision] = React.useState(0)
  const [selected, setSelected] = React.useState<DirectoryItem>(), [upload, setUpload] = React.useState(false), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
  const [inserted, setInserted] = React.useState<Set<string>>(new Set()), pending = React.useRef(false), ids = React.useRef(new Map<string,string>())
  const alive = React.useRef(true); React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const query = directoryQuerySchema.parse({ kind, audience, page, pageSize: 12, search, category, appearance, locale: i18n.getLocale() })
  const listing = useDirectory(query, revision), templates = initialKind === 'analysis-template'
  function change(next: Partial<LibraryParameters>) {
    const value = { ...initial, catalogKind: kind, catalogAudience: audience, catalogPage: 1, search, category, appearance, ...next }
    setKind(value.catalogKind); setAudience(value.catalogAudience); setPage(value.catalogPage); setSearch(value.search); setCategory(value.category); setAppearance(value.appearance)
    setSelected(undefined); setError(''); onQuery?.(value)
  }
  async function use(item: DirectoryItem) {
    if (!item.releaseId || pending.current || inserted.has(item.releaseId)) return
    pending.current = true; setBusy(true); setError('')
    const id = ids.current.get(item.releaseId) ?? crypto.randomUUID(); ids.current.set(item.releaseId, id)
    try { await useResourceTask(item.releaseId, id); if (alive.current) setInserted(previous => new Set([...previous, item.releaseId!])) }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : t.error) }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  const categories = kind === 'analysis-template' || kind === 'visual-theme' || kind === 'component' ? catalogCategories[kind] : []
  return <section className={embedded ? 'space-y-6' : 'library-page template-page space-y-6'} aria-busy={listing.loading || busy}>
    {!embedded && <header className="space-y-2"><h1 className="text-2xl font-semibold">{templates ? t.libTemplates : initialKind === 'example-task' ? t.exploreInsights : t.catalogPublicData}</h1><p className="text-sm text-muted-foreground">{templates ? kind === 'visual-theme' ? t.libraryThemeHint : kind === 'component' ? t.libraryComponentHint : t.libraryAnalysisHint : t.catalogHint}</p></header>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      {templates && <Tabs value={kind} onValueChange={value => change({ catalogKind: kindSchema.parse(value), category: '', appearance: 'all' })}><TabsList>{[['analysis-template',t.libAnalysis],['visual-theme',t.libThemes],['component',t.libComponents]].map(([key,title]) => <TabsTrigger value={key} key={key}>{title}</TabsTrigger>)}</TabsList></Tabs>}
      <div className="flex flex-wrap items-center gap-2"><Tabs value={audience} onValueChange={value => change({ catalogAudience: directoryQuerySchema.shape.audience.parse(value), category: '' })}><TabsList>{initialKind !== 'public-dataset' && <TabsTrigger value="catalog">{t.v2Catalog}</TabsTrigger>}<TabsTrigger value="mine">{t.catalogMine}</TabsTrigger><TabsTrigger value="public">{t.catalogPublic}</TabsTrigger></TabsList></Tabs>
        <Button variant="ghost" disabled={!data.canEdit || busy} onClick={() => setUpload(true)}><Upload aria-hidden="true"/>{t.catalogImport}</Button></div>
    </div>
    {!data.canEdit && <p className="text-sm text-muted-foreground">{t.v2ReadOnly}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      {audience === 'catalog' && <div className="flex flex-wrap gap-1"><Button size="sm" variant={!category ? 'secondary' : 'ghost'} onClick={() => change({ category: '' })}>{t.libraryAll}</Button>{categories.map(value => <Button size="sm" variant={value === category ? 'secondary' : 'ghost'} key={value} onClick={() => change({ category: value })}>{t[categoryKeys[value]]}</Button>)}</div>}
      <form className="ml-auto flex w-full max-w-md items-center gap-2" onSubmit={event => { event.preventDefault(); change({ search: searchDraft.trim() }) }}><Input maxLength={100} value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder={t.catalogSearch} aria-label={t.catalogSearch}/><Button type="submit" variant="ghost" aria-label={t.catalogSearch}><Search aria-hidden="true"/></Button>
        {kind === 'visual-theme' && <Select value={appearance} onValueChange={value => change({ appearance: directoryQuerySchema.shape.appearance.parse(value) })}><SelectTrigger aria-label={t.shellAllAppearance}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t.shellAllAppearance}</SelectItem><SelectItem value="light">{t.shellCategory_light}</SelectItem><SelectItem value="dark">{t.shellCategory_dark}</SelectItem></SelectContent></Select>}
      </form>
    </div>
    {(error || listing.error) && <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive"><p className="break-words">{error || listing.error}</p><Button variant="outline" onClick={() => { setError(''); setRevision(value => value+1) }}><RefreshCw/>{t.refresh}</Button></div>}
    {inserted.size > 0 && <p role="status" className="text-sm">{t.exploreReady}</p>}
    {listing.loading ? <p role="status" className="py-8 text-sm text-muted-foreground">{t.libWorking}</p> : listing.page && <>
      <p aria-live="polite" className="text-sm text-muted-foreground">{t.v2ResultCount.replace('{count}', String(listing.page.total))}</p>
      {!listing.page.items.length ? <div className="space-y-3 py-10 text-center"><h2 className="text-base font-medium">{t.libraryGalleryEmpty}</h2><p className="text-sm text-muted-foreground">{audience === 'public' ? t.catalogPublicEmptyHint : t.v2InstallHint}</p></div> : <DirectoryGallery items={listing.page.items} t={t} busy={busy} canEdit={data.canEdit} inserted={inserted} onOpen={setSelected} onUse={item => void use(item)}/>}
      {listing.page.total > listing.page.pageSize && <nav className="flex items-center justify-end gap-3" aria-label={t.v2Pagination}><Button variant="outline" disabled={page === 1} onClick={() => change({ catalogPage: page-1 })}>{t.catalogPrevious}</Button><span className="text-sm tabular-nums">{page} / {Math.ceil(listing.page.total/listing.page.pageSize)}</span><Button variant="outline" disabled={page*listing.page.pageSize >= listing.page.total} onClick={() => change({ catalogPage: page+1 })}>{t.catalogNext}</Button></nav>}
    </>}
    {selected && <ResourceDetail key={selected.id} item={selected} t={t} data={data} onClose={() => setSelected(undefined)} onChanged={() => setRevision(value => value+1)}/>}
    <ResourceImport open={upload} t={t} onClose={() => setUpload(false)} onImported={() => setRevision(value => value+1)}/>
  </section>
}
