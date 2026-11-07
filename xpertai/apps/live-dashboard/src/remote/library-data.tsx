import * as React from 'react'
import { z } from 'zod/v3'
import { Button, Input, Tabs, TabsList, TabsTrigger, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Database, Plus, ArrowLeft, ChevronRight, RefreshCw, Code2, Trash2,
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@xpert-ai/plugin-shadcn-ui'
import type { JSONValue } from '@xpert-ai/contracts'
import { analyticsDiscoveryResultSchema, datasetRecordSchema, type DatasetRecord, type LibraryData } from '../lib/library.schema'
import { renderDatasetSchema } from '../lib/source-executions'
import { i18n, type messages } from './i18n'
import { libraryAction } from './library-gateway'
import { DatasetPreview } from './dataset-preview'
import { DatasetEditor } from './dataset-editor'

type T = ReturnType<typeof messages>
type Source = LibraryData['sources'][number]
export function DataLibrary({ t, data, initialTab, refresh, run, busy, onUseDataset }: { t: T; data: LibraryData; initialTab?: string; refresh(): Promise<void>; run(work: () => Promise<void>): void; busy: boolean; onUseDataset?(artifactId: string): Promise<void> }) {
  const [tab, setTab] = React.useState(initialTab === 'sources' ? 'sources' : 'datasets'), [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<DatasetRecord>(), [result, setResult] = React.useState<z.infer<typeof renderDatasetSchema>>()
  const [source, setSource] = React.useState<Source>(), [editor, setEditor] = React.useState<{ record?: DatasetRecord; source?: Source } | null>(null)
  const [removing, setRemoving] = React.useState(false), [removeError, setRemoveError] = React.useState(''), [removeBusy, setRemoveBusy] = React.useState(false)
  const filteredDatasets = data.datasets.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const filteredSources = data.sources.filter(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  async function choose(id: string) { setResult(undefined); setSelected(await libraryAction('dataset-open', { artifactId: id }, datasetRecordSchema)) }
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="text-xl font-semibold tracking-tight">{t.libData}</h2><p className="text-sm text-muted-foreground">{t.libDataHint}</p></div><Button disabled={busy || !data.canEdit} onClick={() => setEditor({})}><Plus/>{t.libCreateDataset}</Button></header>
    <div className="border-b px-4 py-3"><Tabs value={tab} onValueChange={value => { setTab(value); setSearch('') }}><TabsList><TabsTrigger value="datasets">{t.libDatasets} · {data.datasets.length}{data.hasMore ? '+' : ''}</TabsTrigger><TabsTrigger value="sources">{t.libSources} · {data.sources.length}</TabsTrigger></TabsList></Tabs></div>
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex min-h-0 min-w-0 flex-col border-b md:border-r md:border-b-0"><div className="p-3"><Input value={search} placeholder={t.libSearchData} aria-label={t.libSearchData} onChange={e => setSearch(e.target.value)}/></div><div className="flex max-h-48 flex-col gap-1 overflow-auto px-2 pb-3 md:max-h-none md:flex-1">
        {tab === 'datasets' ? filteredDatasets.map(item => <Button className="justify-start" variant={selected?.artifactId === item.artifactId ? 'secondary' : 'ghost'} key={item.artifactId} disabled={busy} onClick={() => run(() => choose(item.artifactId))}><Database/><span className="truncate">{item.name}</span></Button>) : filteredSources.map((item,i) => <Button className="justify-start" variant={source === item ? 'secondary' : 'ghost'} key={i} onClick={() => setSource(item)}><Database/><span className="truncate">{item.name}</span></Button>)}
        {!(tab === 'datasets' ? filteredDatasets : filteredSources).length && <p className="p-3 text-sm text-muted-foreground">{search ? t.libNoMatches : tab === 'datasets' ? t.libNoDatasets : t.libNoSources}</p>}
      </div></aside>
      <section className="min-h-0 min-w-0 overflow-auto p-5">
        {tab === 'sources' ? source ? <SourceDetail key={JSON.stringify(source.source)} source={source} t={t} onCreate={() => setEditor({ source })}/> : <EmptyData t={t} kind="sources"/> : selected ? <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div className="space-y-2"><h3 className="text-lg font-semibold tracking-tight">{selected.name}</h3><p className="text-sm text-muted-foreground">{selected.description}</p><Badge variant="outline">{selected.fields} {t.libFields} · r{selected.revision}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditor({ record: selected })}><Code2/>{t.libEditDataset}</Button>{onUseDataset && <Button disabled={busy} onClick={() => run(() => onUseDataset(selected.artifactId))}>{t.libUseDataset}</Button>}</div></div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t.libSource}</dt><dd>{data.sources.find(item => JSON.stringify(item.source) === JSON.stringify(selected.source))?.name ?? t.libSourceUnavailable}</dd></div><div><dt className="text-muted-foreground">{t.libUpdated}</dt><dd>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString(i18n.getLocale()) : '—'}</dd></div></dl>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t.libPreview}</h3><Button variant="outline" disabled={busy} onClick={() => run(async () => setResult(await libraryAction('dataset-preview', { artifactId: selected.artifactId }, renderDatasetSchema)))}><RefreshCw/>{t.libRunQuery}</Button></div>
          {result ? <DatasetPreview result={result} t={t}/> : <p className="border-y py-8 text-sm text-muted-foreground">{t.libPreviewHint}</p>}
          <details className="text-sm"><summary>{t.libQueryConfig}</summary><pre className="mt-2 max-h-64 overflow-auto bg-muted p-3 text-xs">{JSON.stringify(selected.definition.binding.payload, null, 2)}</pre></details>
          <Button variant="ghost" disabled={busy} onClick={() => { setRemoveError(''); setRemoving(true) }}><Trash2/>{t.libDeleteDataset}</Button>
        </div> : <div className="mx-auto max-w-xl space-y-4 py-10"><EmptyData t={t} kind="datasets"/><Button disabled={busy || !data.canEdit} onClick={() => setEditor({})}><Plus/>{t.libCreateDataset}</Button></div>}
      </section>
    </div>
    {editor && <DatasetEditor t={t} data={data} {...editor} onClose={() => setEditor(null)} onSaved={async record => { await refresh(); setSelected(record); setResult(undefined); setTab('datasets') }}/ >}
    <AlertDialog open={removing} onOpenChange={open => { if (!removeBusy) setRemoving(open) }}><AlertDialogContent><AlertDialogTitle>{t.libDeleteDataset}</AlertDialogTitle><AlertDialogDescription>{t.libDeleteHint} {selected?.name}</AlertDialogDescription>{removeError && <p role="alert" className="text-destructive">{removeError}</p>}<AlertDialogFooter><AlertDialogCancel disabled={removeBusy}>{t.cancel}</AlertDialogCancel><Button variant="destructive" disabled={removeBusy} onClick={() => {
      if (!selected) return
      setRemoveBusy(true); setRemoveError('')
      void libraryAction('dataset-delete', { artifactId: selected.artifactId, expectedRevision: selected.revision, confirmed: true }, z.object({ artifactId: z.string() })).then(async () => { setRemoving(false); setSelected(undefined); setResult(undefined); await refresh() }).catch(e => setRemoveError(String(e.message))).finally(() => setRemoveBusy(false))
    }}>{t.libDeleteDataset}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
function EmptyData({ t, kind }: { t: T; kind: 'datasets' | 'sources' }) {
  return <div className="space-y-3"><Database className="text-muted-foreground"/><h3 className="text-sm font-semibold">{kind === 'datasets' ? t.libDatasetEmptyTitle : t.libSourceEmptyTitle}</h3><p className="text-sm text-muted-foreground">{kind === 'datasets' ? t.libDatasetEmptyHint : t.libSourceEmptyHint}</p></div>
}
function SourceDetail({ source, t, onCreate }: { source: Source; t: T; onCreate(): void }) {
  const [provider, setProvider] = React.useState(source.providers[0]?.id ?? ''), [result, setResult] = React.useState<z.infer<typeof analyticsDiscoveryResultSchema>>()
  const [history, setHistory] = React.useState<JSONValue[]>([]), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [metadata, setMetadata] = React.useState<JSONValue>()
  const sequence = React.useRef(0)
  async function discover(request: JSONValue, nextHistory: JSONValue[]) {
    const current = ++sequence.current; setBusy(true); setError(''); setMetadata(undefined)
    try { const value = await libraryAction('discover', { source: source.source, providerId: provider, request }, analyticsDiscoveryResultSchema); if (current === sequence.current) { setResult(value); setHistory(nextHistory) } }
    catch(e) { if (current === sequence.current) setError(e instanceof Error ? e.message : t.error) }
    finally { if (current === sequence.current) setBusy(false) }
  }
  React.useEffect(() => { setResult(undefined); if (provider) void discover({}, [{}]); return () => { ++sequence.current } }, [provider])
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div className="space-y-2"><h3 className="text-lg font-semibold tracking-tight">{source.name}</h3><Badge variant="outline">{source.source.kind === 'data-source' ? t.libConnection : source.source.kind === 'definition' ? t.libDefinition : t.libArtifact}</Badge></div><Button onClick={onCreate} disabled={!provider}>{t.libCreateDataset}</Button></div>
    <p className="text-sm text-muted-foreground">{t.libConnectionOwned}</p>
    {source.providers.length > 1 && <Select value={provider} onValueChange={setProvider} disabled={busy}><SelectTrigger aria-label={t.libQueryMethod}><SelectValue/></SelectTrigger><SelectContent>{source.providers.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t.libBrowseSource}</h3><div className="flex gap-2">{history.length > 1 && <Button variant="outline" disabled={busy} onClick={() => { const previous = history.slice(0,-1); void discover(previous.at(-1)!, previous) }}><ArrowLeft/>{t.libBack}</Button>}<Button variant="outline" disabled={busy || !provider} onClick={() => void discover(history.at(-1) ?? {}, history.length ? history : [{}])}><RefreshCw/>{t.refresh}</Button></div></div>
    {busy && <p role="status">{t.libWorking}</p>}{error && <p role="alert" className="text-destructive break-words">{error}</p>}
    <div className="grid gap-2">{result?.items.map(item => <div key={item.id} className="flex items-center gap-2 border-b pb-2"><Button variant="ghost" className="min-w-0 flex-1 justify-between" disabled={busy} onClick={() => item.inspectRequest ? void discover(item.inspectRequest, [...history,item.inspectRequest]) : setMetadata(item.metadata)}><span className="truncate">{item.name}</span><ChevronRight/></Button><Badge variant="secondary">{item.kind === 'dataset' ? t.libDataset : t.libFolder}</Badge></div>)}</div>
    {!busy && result && !result.items.length && <p className="text-sm text-muted-foreground">{t.libNoResources}</p>}
    {result?.nextRequest && <Button variant="outline" disabled={busy} onClick={() => void discover(result.nextRequest!, [...history.slice(0,-1),result.nextRequest!])}>{t.libLoadMore}</Button>}
    {metadata !== undefined && <pre className="max-h-64 overflow-auto bg-muted p-3 text-xs">{JSON.stringify(metadata,null,2)}</pre>}
    {result && <details className="text-sm"><summary>{t.libQueryGuide}</summary><p className="whitespace-pre-wrap py-3 text-muted-foreground">{result.queryContract.instructions}</p><pre className="max-h-64 overflow-auto bg-muted p-3 text-xs">{JSON.stringify(result.queryContract.payloadSchema,null,2)}</pre></details>}
  </div>
}
