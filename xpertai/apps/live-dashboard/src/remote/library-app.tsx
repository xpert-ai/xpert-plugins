import * as React from 'react'
import { Button, RefreshCw } from '@xpert-ai/plugin-shadcn-ui'
import { libraryDataSchema, libraryQuerySchema, type LibraryPage, type LibraryData } from '../lib/library.schema'
import { requestHost, startBridge } from './bridge'
import { messages } from './i18n'
import { DataLibrary } from './library-data'
import { openLibrary } from './library-gateway'
import { ExploreView } from './explore-view'
import { ResourceLibrary } from './resource-library'

export function LibraryApp({ page }: { page: LibraryPage }) {
  const [t, setT] = React.useState(() => messages('en-US')), [data, setData] = React.useState<LibraryData>()
  const [parameters, setParameters] = React.useState<NonNullable<ReturnType<typeof libraryQuerySchema.parse>['parameters']>>({})
  const [busy, setBusy] = React.useState(true), [error, setError] = React.useState(''), [scope, setScope] = React.useState(0)
  const publicData = parameters.audience === 'public'
  const sequence = React.useRef(0), queryKey = React.useRef(''), generation = React.useRef(0), activeRun = React.useRef(0)
  async function load(nextPage = 1) {
    const current = ++sequence.current
    const result = libraryDataSchema.parse(await requestHost('requestData', { query: { page: nextPage, pageSize: 30 } })).meta
    if (current === sequence.current) setData(previous => ({ ...result, datasets: nextPage === 1 ? result.datasets : [...(previous?.datasets ?? []), ...result.datasets] }))
  }
  async function run(work: () => Promise<void>) {
    const scope = generation.current, runId = ++activeRun.current
    const current = () => generation.current === scope && activeRun.current === runId
    setBusy(true); setError('')
    try { await work() }
    catch(e) { if (current()) setError(e instanceof Error ? e.message : t.error) }
    finally { if (current()) setBusy(false) }
  }
  React.useEffect(() => startBridge((locale, initialQuery) => {
    setT(messages(locale))
    const parsed = libraryQuerySchema.safeParse(initialQuery ?? {})
    if (!parsed.success) { setError('DASHBOARD_NAVIGATION_INVALID'); setBusy(false); return }
    const key = JSON.stringify(parsed.data.parameters ?? {})
    if (key !== queryKey.current) { queryKey.current = key; setParameters(parsed.data.parameters ?? {}); void run(() => load()) }
  }, () => { void run(() => load()) }, () => { ++generation.current; ++activeRun.current; ++sequence.current; queryKey.current = ''; setData(undefined); setError(''); setBusy(true); setScope(value => value + 1) }), [])
  return <main className="dashboard-shell" aria-busy={busy}>
    {error && <div role="alert" className="flex items-center justify-between gap-3 border-b px-4 py-3 text-destructive"><p className="min-w-0 break-words">{error}</p><Button variant="outline" onClick={() => void run(() => load())}><RefreshCw/>{t.refresh}</Button></div>}
    {!data ? <p role="status" className="p-6 text-muted-foreground">{t.libWorking}</p> : <div key={`${scope}:${JSON.stringify(parameters)}`} className="min-h-0 flex-1 overflow-auto">
      {page==='data'&&<div className="flex gap-2 border-b px-4 py-3"><Button variant={publicData?'ghost':'secondary'} onClick={()=>void run(()=>openLibrary('data', { audience: 'mine' }))}>{t.libMyData}</Button><Button variant={publicData?'secondary':'ghost'} onClick={()=>void run(()=>openLibrary('data', { audience: 'public' }))}>{t.catalogPublicData}</Button></div>}
      {page === 'explore' ? <ExploreView t={t} data={data} busy={busy} error={error} run={work => void run(work)} initialAudience={parameters.audience} initial={parameters} onQuery={next => void run(() => openLibrary('explore', next))}/> : page === 'templates' || page === 'data' && publicData ? <ResourceLibrary t={t} data={data} initialAudience={parameters.audience} initialKind={page === 'templates' ? 'analysis-template' : 'public-dataset'} initial={parameters} onQuery={next => void run(() => openLibrary(page, { ...next, ...(page === 'data' ? { audience: 'public' as const } : {}) }))}/> : !data.canEdit ? <p role="status" className="p-6">{t.draftAccessDenied}</p> : <DataLibrary t={t} data={data} initialTab={parameters.tab} refresh={() => load()} run={work => void run(work)} busy={busy}/>}
    </div>}
    {data?.hasMore && <div className="border-t p-3"><Button variant="outline" disabled={busy} onClick={() => void run(() => load(data.page + 1))}>{t.libLoadMore}</Button></div>}
  </main>
}
