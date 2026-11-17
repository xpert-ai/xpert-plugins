import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  Tabs, TabsContent, TabsList, TabsTrigger, Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { requestData, startBridge } from './bridge'
import { CaseDesk, CaseDialog } from './cases'
import { parseWorkbenchData } from './data'
import type { WorkbenchData } from './data'
import { i18n } from './i18n'
import { ComparisonSetup } from './setup'
import { RunResults } from './results'
import './styles.css'

const empty: WorkbenchData = {
  cases: [], categories: [], selected: null, activePrompt: null, runs: { items: [], total: 0, page: 1 }, run: null
}
interface Query { caseId?: string; runId?: string; page: string }

function Workbench() {
  useRemoteLocale(i18n)
  const [data, setData] = useState(empty)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tab, setTab] = useState('cases')
  const [runId, setRunId] = useState<string | null>(null)
  const [caseId, setCaseId] = useState<string | null>(null)
  /** The case id the data on screen was loaded for, to tell "still loading" from "not there". */
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null)
  // What the next load asks for. The open case and run stay in it, so every refresh brings them up to date.
  const query = useRef<Query>({ page: '1' })
  const sequence = useRef(0)
  const initialized = useRef(false)
  const [hostReady, setHostReady] = useState(false)
  const load = useCallback(async () => {
    const current = ++sequence.current
    const asked = query.current
    try {
      const loaded = parseWorkbenchData(await requestData({ ...asked }))
      if (current === sequence.current) { setData(loaded); setLoadedCaseId(asked.caseId ?? null); setState('ready') }
    } catch { if (current === sequence.current) setState('failed') }
  }, [])
  useEffect(() => startBridge(init => {
    i18n.setLocale(init.locale)
    // A later init only changes the language; it must not reload or reset what the person is doing.
    if (!initialized.current) { initialized.current = true; setHostReady(true); void load() }
  }, () => void load()), [load])
  const selectRun = (id: string | null) => {
    query.current = { page: query.current.page, ...(id ? { runId: id } : {}) }
    setRunId(id)
    setTab('runs')
    setState('loading')
    void load()
  }
  const openCase = (id: string | null) => {
    const { caseId: _closed, ...rest } = query.current
    query.current = id ? { ...rest, caseId: id } : rest
    setCaseId(id)
    void load()
  }
  const turnPage = (page: number) => { query.current = { page: String(page) }; void load() }
  const active = data.run?.status === 'running' || data.run?.status === 'ready'
  useEffect(() => {
    if (!runId || !active) return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [active, runId, load])
  const openDetail = caseId && data.selected?.id === caseId ? data.selected : null
  return (
    <main className="photo-intake">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div><h1>{i18n.t('view.title')}</h1><p>{i18n.t('view.subtitle')}</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()}>{i18n.t('view.refresh')}</Button>
      </header>
      <hr />
      {state === 'loading' ? <p className="p-4" role="status">{i18n.t('view.loading')}</p> : null}
      {state === 'failed' ? <p className="p-4" role="alert">{i18n.t('view.loadFailed')}</p> : null}
      {hostReady ? <Tabs value={tab} onValueChange={setTab} className="workbench-tabs">
        <TabsList className="tab-navigation">
          <TabsTrigger value="cases">{i18n.t('nav.cases')}</TabsTrigger>
          <TabsTrigger value="compare">{i18n.t('nav.compare')}</TabsTrigger>
          <TabsTrigger value="runs">{i18n.t('nav.runs')}</TabsTrigger>
        </TabsList>
        <div className="workbench-content">
          <TabsContent value="cases" forceMount hidden={tab !== 'cases'}>
            <CaseDesk data={data} refresh={load} open={openCase} />
          </TabsContent>
          <TabsContent value="compare" forceMount hidden={tab !== 'compare'}>
            {/* Keyed on the prompt in effect: the form starts from it, and starts over when it changes. */}
            <ComparisonSetup key={data.activePrompt ? JSON.stringify(data.activePrompt.source) : 'loading'} data={data} created={selectRun} />
          </TabsContent>
          <TabsContent value="runs" forceMount hidden={tab !== 'runs'}>
            {runId ? data.run?.id === runId ? (
              <RunResults key={data.run.id} run={data.run} categories={data.categories} activePrompt={data.activePrompt}
                refresh={load} back={() => selectRun(null)} />
            ) : <div><p>{i18n.t(state === 'loading' ? 'run.loading' : 'run.unavailable')}</p>
              <Button variant="ghost" onClick={() => selectRun(null)}>{i18n.t('run.back')}</Button></div> : (
              <section className="flex flex-col gap-3">
                <h2>{i18n.t('nav.runs')}</h2><hr />
                {data.runs.items.length === 0 ? <p>{i18n.t('run.empty')}</p> : <Table>
                  <TableHeader><TableRow><TableHead>{i18n.t('setup.title')}</TableHead><TableHead>{i18n.t('run.status')}</TableHead><TableHead>{i18n.t('run.created')}</TableHead></TableRow></TableHeader>
                  <TableBody>{data.runs.items.map(run => <TableRow key={run.id}>
                    <TableCell><Button variant="link" onClick={() => selectRun(run.id)}>{run.title}</Button></TableCell>
                    <TableCell><Badge variant="secondary">{i18n.t(`runStatus.${run.status}`)}</Badge></TableCell>
                    <TableCell>{i18n.date(run.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>}
                <div className="flex items-center gap-3">
                  <Button variant="outline" disabled={data.runs.page <= 1} onClick={() => turnPage(data.runs.page - 1)}>{i18n.t('common.previous')}</Button>
                  <span>{i18n.t('common.page', { page: data.runs.page })}</span>
                  <Button variant="outline" disabled={data.runs.page * 20 >= data.runs.total} onClick={() => turnPage(data.runs.page + 1)}>{i18n.t('common.next')}</Button>
                </div>
              </section>
            )}
          </TabsContent>
        </div>
      </Tabs> : null}
      <Dialog open={caseId !== null} onOpenChange={open => { if (!open) openCase(null) }}>
        <DialogContent className="evidence-dialog">
          {openDetail ? <CaseDialog key={openDetail.id} detail={openDetail} categories={data.categories} refresh={load} /> : (
            <DialogHeader>
              <DialogTitle>{i18n.t('case.dialogTitle')}</DialogTitle>
              <DialogDescription>{i18n.t(
                state === 'failed' ? 'view.loadFailed' : loadedCaseId === caseId ? 'case.unavailable' : 'case.loading'
              )}</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

const container = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))
createRoot(container).render(<RemoteI18nProvider i18n={i18n}><Workbench /></RemoteI18nProvider>)
