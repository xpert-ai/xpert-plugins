import { useEffect, useRef, useState } from 'react'
import { Button, Input, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsList, TabsTrigger, Checkbox } from '@xpert-ai/plugin-shadcn-ui'
import { ArrowLeft, ArrowUp, ArrowDown, Upload, Plus, Loader2, ExternalLink } from 'lucide-react'
import { z } from 'zod/v3'
import { action, command, fileAction, notify } from './bridge'
import { t, useLocale } from './i18n'
import { templateCatalogSchema, templateReportSchema, templateSourceSchema, type TemplateSource, type TemplateReport } from '../src/lib/template-schema'
import { parsePptx, type PptxDeck } from '../src/core/pptx-file.utils'
import { PptxCanvas } from './canvas/PptxCanvas'

const librarySchema = templateCatalogSchema.extend({ enterprise: z.array(z.object({ kind: z.literal('file'), filePath: z.string(), title: z.string(), expectedRevision: z.string() })),
  covers: z.array(z.object({ id: z.string(), en: z.string(), zh: z.string() })), hasMore: z.boolean(), nextOffset: z.number() })
const previewSchema = templateReportSchema.extend({ contentBase64: z.string(), revision: z.string(), hasMore: z.boolean() })
const createdSchema = z.object({ filePath: z.string(), title: z.string(), card: z.object({ open: z.object({ target: z.literal('assistant.project'), projectId: z.string(),
  viewKey: z.string(), selectionId: z.string(), parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])) }) }) })
type Draft = { texts: Record<string, string>; notes?: string }
export function TemplateLibrary({ onOpened }: { onOpened?: () => void }) {
  const locale = useLocale(), upload = useRef<HTMLInputElement>(null), epoch = useRef(0)
  const [library, setLibrary] = useState<z.infer<typeof librarySchema>>()
  const [tab, setTab] = useState('builtin'), [search, setSearch] = useState('')
  const [language, setLanguage] = useState<'en' | 'zh'>(locale.startsWith('zh') ? 'zh' : 'en')
  const [source, setSource] = useState<TemplateSource>(), [deck, setDeck] = useState<PptxDeck>()
  const [report, setReport] = useState<TemplateReport>(), [pages, setPages] = useState<Record<number, TemplateReport['slides'][number]>>({})
  const [page, setPage] = useState(1), [chosen, setChosen] = useState<number[]>([1]), [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [slot, setSlot] = useState('')
  const [created, setCreated] = useState<z.infer<typeof createdSchema>>()
  const operation = useRef<{ fingerprint: string; id: string }>()
  const fail = (error: unknown) => setError(error instanceof Error && error.message.startsWith('pptx.template_')
    ? t('templates.compatibilityError', { code: error.message }) : t('templates.failed'))
  const load = async (more = false) => {
    setBusy(true); setError('')
    try {
      const value = librarySchema.parse(await action('templates.list', { offset: more ? library?.nextOffset ?? 0 : 0 }))
      setLibrary(previous => more && previous ? { ...value, enterprise: [...previous.enterprise, ...value.enterprise] } : value)
    } catch (error) { fail(error) } finally { setBusy(false) }
  }
  useEffect(() => { void load(); return () => { epoch.current++ } }, [])
  async function choose(next: TemplateSource, name: string) {
    const ticket = ++epoch.current
    setSource(next); setDeck(undefined); setReport(undefined); setPages({}); setPage(1); setChosen([1]); setDrafts({}); setCreated(undefined)
    setTitle(name); setBusy(true); setError('')
    try {
      const result = previewSchema.parse(await action('templates.preview', { source: next, offset: 0, limit: 3 }))
      const bytes = Uint8Array.from(atob(result.contentBase64), char => char.charCodeAt(0))
      const parsed = await parsePptx(bytes.buffer)
      if (ticket !== epoch.current) return
      setDeck(parsed); setReport(result); setPages(Object.fromEntries(result.slides.map(slide => [slide.number, slide])))
    } catch (error) { if (ticket === epoch.current) fail(error) } finally { if (ticket === epoch.current) setBusy(false) }
  }
  async function visit(number: number) {
    setPage(number); setSlot('')
    if (pages[number] || !source) return
    const ticket = epoch.current
    setBusy(true); setError('')
    try {
      const result = templateReportSchema.parse(await action('templates.inspect', { source, offset: number - 1, limit: 1 }))
      if (ticket === epoch.current) setPages(previous => ({ ...previous, ...Object.fromEntries(result.slides.map(slide => [slide.number, slide])) }))
    } catch (error) { if (ticket === epoch.current) fail(error) } finally { if (ticket === epoch.current) setBusy(false) }
  }
  async function importFile(file?: File) {
    if (!file) return
    if (file.size > 25 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pptx')) { setError(t('templates.fileLimit')); return }
    setBusy(true); setError('')
    try {
      const result = z.object({ source: templateSourceSchema, title: z.string() }).parse(await fileAction('templates.import', { operationId: crypto.randomUUID(), title: file.name }, file))
      await choose(result.source, result.title.replace(/\.pptx$/i, ''))
      void load()
    } catch (error) { fail(error) } finally { setBusy(false); if (upload.current) upload.current.value = '' }
  }
  async function openResult(result: z.infer<typeof createdSchema>) {
    try { await command('workbench.navigation.open', result.card.open); onOpened?.() }
    catch { setError(t('templates.openFailed')) }
  }
  async function create() {
    if (!source || !chosen.length) return
    setBusy(true); setError('')
    const slides = chosen.map(sourceSlide => ({ sourceSlide, ...(drafts[sourceSlide]?.notes !== undefined ? { notes: drafts[sourceSlide].notes } : {}),
      fills: Object.entries(drafts[sourceSlide]?.texts ?? {}).map(([objectId, text]) => ({ kind: 'text' as const, objectId, text })) }))
    const content = { title, source, slides }, fingerprint = JSON.stringify(content)
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() }
    try {
      const result = createdSchema.parse(await action('templates.compose', { ...content, operationId: operation.current.id }))
      setCreated(result); notify('success', t('templates.created')); await openResult(result)
    } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const current = pages[page], draft = drafts[page], blocked = report?.issues.some(issue => issue.blocking)
  const textObjects = current?.objects.filter(object => object.kind === 'text' && object.fillable) ?? []
  const textObject = textObjects.find(object => object.objectId === slot) ?? textObjects[0]
  const builtinMatches = library?.templates.filter(item => `${item.names.en} ${item.names.zh} ${item.description}`.toLowerCase().includes(search.toLowerCase())) ?? []
  const enterpriseMatches = library?.enterprise.filter(item => item.title.toLowerCase().includes(search.toLowerCase())) ?? []
  const toggle = (number: number) => { setCreated(undefined); setChosen(previous => previous.includes(number) ? previous.filter(item => item !== number) : [...previous, number]) }
  const move = (index: number, delta: number) => { setCreated(undefined); setChosen(previous => {
    const result = [...previous], next = index + delta
    if (next >= 0 && next < result.length) [result[index], result[next]] = [result[next], result[index]]
    return result
  }) }
  return <section className="flex h-full min-h-0 flex-col bg-background" aria-label={t('templates.title')}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="flex items-center gap-2">{source && <Button variant="ghost" size="icon" aria-label={t('templates.back')} disabled={busy} onClick={() => { epoch.current++; setSource(undefined); setError(''); void load() }}><ArrowLeft/></Button>}
        <div><h2>{t('templates.title')}</h2><p className="text-sm text-muted-foreground">{t('templates.subtitle')}</p></div></div>
      {!source && <Button variant="outline" disabled={busy} onClick={() => upload.current?.click()}><Upload/>{t('templates.import')}</Button>}
      <Input ref={upload} type="file" accept=".pptx" className="hidden" aria-label={t('templates.import')} onChange={event => void importFile(event.target.files?.[0])}/>
    </header>
    {error && <p role="alert" className="px-4 py-2 text-destructive">{error}</p>}
    {busy && <p role="status" className="flex items-center gap-2 px-4 py-2"><Loader2 className="animate-spin"/>{t('templates.loading')}</p>}
    {!source ? <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3"><Tabs value={tab} onValueChange={setTab}><TabsList>
        <TabsTrigger value="builtin">{t('templates.builtin')}</TabsTrigger><TabsTrigger value="enterprise">{t('templates.enterprise')}</TabsTrigger>
      </TabsList></Tabs><Input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('templates.search')} placeholder={t('templates.search')} className="max-w-64"/>
        <Select value={language} onValueChange={value => setLanguage(value === 'zh' ? 'zh' : 'en')}><SelectTrigger className="w-auto" aria-label={t('templates.language')}><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="zh">{t('templates.zh')}</SelectItem><SelectItem value="en">{t('templates.en')}</SelectItem></SelectContent></Select></div>
      {tab === 'builtin' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{builtinMatches.map(item =>
          <article key={item.id} className="min-w-0 overflow-hidden rounded-lg border">
            <img className="aspect-video w-full object-contain" alt={item.names[language]} src={library?.covers.find(cover => cover.id === item.id)?.[language]} loading="lazy"/>
            <div className="flex flex-col gap-2 p-3"><h3>{item.names[language]}</h3><p className="text-sm text-muted-foreground">{t('templates.layoutCount', { count: item.layouts.length })}</p>
              <Button variant="outline" disabled={busy} onClick={() => void choose({ kind: 'builtin', templateId: item.id, language }, item.names[language])}>{t('templates.preview')}</Button></div>
          </article>)}</div> : <div className="space-y-3">
          {!library?.enterprise.length && <p className="text-muted-foreground">{t('templates.emptyEnterprise')}</p>}
          {enterpriseMatches.map(item => <article key={item.filePath} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="min-w-0"><h3 className="break-words">{item.title}</h3><p className="text-sm text-muted-foreground">{t('templates.projectTemplate')}</p></div>
            <Button variant="outline" disabled={busy} onClick={() => void choose({ kind: item.kind, filePath: item.filePath, expectedRevision: item.expectedRevision }, item.title)}>{t('templates.preview')}</Button>
          </article>)}{library?.hasMore && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>{t('templates.more')}</Button>}
        </div>}
      {search && (tab === 'builtin' ? builtinMatches : enterpriseMatches).length === 0 && <p>{t('templates.noResults')}</p>}
    </div> : <>
      {deck && <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <aside className="space-y-3 overflow-auto border-r p-3" aria-label={t('templates.layouts')}>
          <Button variant="outline" disabled={busy} onClick={() => { setCreated(undefined); setChosen(chosen.length === deck.slides.length ? [] : deck.slides.map((_, i) => i + 1)) }}>{t(chosen.length === deck.slides.length ? 'templates.clear' : 'templates.selectAll')}</Button>
          {deck.slides.map((slide, index) => <div key={slide.path} className="space-y-1">
            <Button variant={page === index + 1 ? 'secondary' : 'ghost'} className="ppt-thumbnail w-full p-1" aria-label={t('templates.page', { number: index + 1 })} disabled={busy} onClick={() => void visit(index + 1)}>
              <span className="w-full overflow-hidden rounded border"><PptxCanvas deck={deck} slide={slide}/></span>
            </Button><Label className="flex items-center gap-2"><Checkbox checked={chosen.includes(index + 1)} onCheckedChange={() => toggle(index + 1)} disabled={busy}/>{t('templates.page', { number: index + 1 })}</Label>
          </div>)}
        </aside>
        <main className="min-w-0 space-y-4 overflow-auto p-4">
          {report?.issues.length ? <div role={blocked ? 'alert' : 'status'} className="space-y-1 rounded-lg border p-3"><p>{t(blocked ? 'templates.blocked' : 'templates.warnings')}</p>
            {report.issues.slice(0, 8).map((issue, index) => <p key={index} className="break-words text-sm text-muted-foreground">{issue.code} · {issue.part}</p>)}</div> : null}
          <div className="overflow-hidden border"><PptxCanvas deck={deck} slide={deck.slides[page - 1]}/></div>
          <p className="text-sm text-muted-foreground">{t('templates.nativeHint')}</p>
          <h3>{t('templates.order')}</h3><div className="flex flex-wrap gap-2">{chosen.map((number, index) => <div key={number} className="flex items-center gap-1 rounded border p-1">
            <Button variant="ghost" disabled={busy} onClick={() => void visit(number)}>{number}</Button>
            <Button variant="ghost" size="icon" aria-label={t('templates.moveUp', { number })} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp/></Button>
            <Button variant="ghost" size="icon" aria-label={t('templates.moveDown', { number })} disabled={busy || index === chosen.length - 1} onClick={() => move(index, 1)}><ArrowDown/></Button>
          </div>)}</div>
        </main>
        <aside className="space-y-4 overflow-auto border-l p-4" aria-label={t('templates.fill')}>
          <Label className="block space-y-2"><span>{t('templates.outputTitle')}</span><Input value={title} maxLength={160} onChange={event => { setTitle(event.target.value); setCreated(undefined) }}/></Label>
          <h3>{t('templates.fill')}</h3><p className="text-sm text-muted-foreground">{t('templates.fillHint')}</p>
          {textObject && <div className="space-y-2">
            <Select value={textObject.objectId} onValueChange={setSlot}><SelectTrigger aria-label={t('templates.textObject')}><SelectValue/></SelectTrigger>
              <SelectContent>{textObjects.map(object => <SelectItem key={object.objectId} value={object.objectId}>{object.text.slice(0, 36) || object.name}</SelectItem>)}</SelectContent></Select>
              <Textarea aria-label={t('templates.textObject')} value={draft?.texts[textObject.objectId] ?? textObject.text} maxLength={4000} rows={6} disabled={busy} onChange={event => {
                const value = event.target.value; setCreated(undefined)
                setDrafts(previous => ({ ...previous, [page]: { ...previous[page], texts: { ...previous[page]?.texts, [textObject.objectId]: value } } }))
              }}/></div>}
          <Label className="block space-y-2"><span>{t('templates.notes')}</span><Textarea rows={5} value={draft?.notes ?? current?.notes ?? ''} maxLength={8000} disabled={busy || !current} onChange={event => {
            const notes = event.target.value; setCreated(undefined); setDrafts(previous => ({ ...previous, [page]: { texts: previous[page]?.texts ?? {}, notes } }))
          }}/></Label>
        </aside>
      </div>}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-4"><p className="text-sm text-muted-foreground">{t('templates.selected', { count: chosen.length })}</p>
        {created ? <Button onClick={() => void openResult(created)}><ExternalLink/>{t('templates.open')}</Button> :
          <Button disabled={busy || !deck || blocked || !title.trim() || !chosen.length} onClick={() => void create()}><Plus/>{t('templates.create')}</Button>}</footer>
    </>}
  </section>
}
