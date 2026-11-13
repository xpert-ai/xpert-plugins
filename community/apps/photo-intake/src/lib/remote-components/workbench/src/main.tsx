import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  Tabs, TabsContent, TabsList, TabsTrigger, Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useLocalizedMessage, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { executeAction, requestData, startBridge } from './bridge'
import { parseWorkbenchData } from './data'
import type { WorkbenchData } from './data'
import type { CaseDetail } from '../../../domain/case'
import { Choice } from './choices'
import { i18n } from './i18n'
import { ComparisonSetup, SampleLibrary } from './setup'
import { RunResults } from './results'
import './styles.css'

const empty: WorkbenchData = { cases: [], categories: [], selected: null, runs: { items: [], total: 0, page: 1 }, run: null }

function Workbench() {
  useRemoteLocale(i18n)
  const [data, setData] = useState(empty)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tab, setTab] = useState('samples')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = useRef<{ runId?: string; page: string }>({ page: '1' })
  const sequence = useRef(0)
  const initialized = useRef(false)
  const [hostReady, setHostReady] = useState(false)
  const [photo, setPhoto] = useState<CaseDetail | null>(null)
  const [reference, setReference] = useState('unclear')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useLocalizedMessage(i18n)
  const load = useCallback(async () => {
    const current = ++sequence.current
    try {
      const loaded = parseWorkbenchData(await requestData(query.current))
      if (current === sequence.current) { setData(loaded); setState('ready') }
    } catch { if (current === sequence.current) setState('failed') }
  }, [])
  useEffect(() => startBridge(init => {
    i18n.setLocale(init.locale)
    if (!initialized.current) { initialized.current = true; setHostReady(true); void load() }
  }, () => void load()), [load])
  const selectRun = (id: string | null) => {
    query.current = { page: query.current.page, ...(id ? { runId: id } : {}) }
    setSelectedId(id)
    setTab('runs')
    setState('loading')
    void load()
  }
  const active = data.run?.status === 'running' || data.run?.status === 'ready'
  useEffect(() => {
    if (!selectedId || !active) return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [active, selectedId, load])
  const inspect = async (id: string) => {
    setNotice('')
    try {
      const selected = parseWorkbenchData(await requestData({ caseId: id })).selected
      setPhoto(selected)
      setReference(selected?.referenceCategoryId ?? 'unclear')
    } catch { setNotice(i18n.message('view.loadFailed')) }
  }
  const saveReference = async () => {
    if (!photo) return
    setSaving(true); setNotice('')
    try {
      await executeAction('set_reference', { caseId: photo.id, revision: photo.revision, categoryId: reference })
      setPhoto(null)
      await load()
    } catch { setNotice(i18n.message('common.actionFailed')) } finally { setSaving(false) }
  }
  return (
    <main className="photo-intake">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div><h1>{i18n.t('view.title')}</h1><p>{i18n.t('view.subtitle')}</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()}>{i18n.t('view.refresh')}</Button>
      </header>
      <hr />
      {state === 'loading' ? <p className="p-4" role="status">{i18n.t('view.loading')}</p> : null}
      {state === 'failed' ? <p className="p-4" role="alert">{i18n.t('view.loadFailed')}</p> : null}
      {notice ? <p className="p-4" role="status">{notice}</p> : null}
      {hostReady ? <Tabs value={tab} onValueChange={setTab} className="workbench-tabs">
        <TabsList className="tab-navigation">
          <TabsTrigger value="samples">{i18n.t('nav.samples')}</TabsTrigger>
          <TabsTrigger value="compare">{i18n.t('nav.compare')}</TabsTrigger>
          <TabsTrigger value="runs">{i18n.t('nav.runs')}</TabsTrigger>
        </TabsList>
        <div className="workbench-content">
          <TabsContent value="samples" forceMount hidden={tab !== 'samples'}>
            <SampleLibrary data={data} refresh={load} inspect={id => void inspect(id)} />
          </TabsContent>
          <TabsContent value="compare" forceMount hidden={tab !== 'compare'}>
            <ComparisonSetup data={data} created={selectRun} />
          </TabsContent>
          <TabsContent value="runs" forceMount hidden={tab !== 'runs'}>
            {selectedId ? data.run?.id === selectedId ? (
              <RunResults key={data.run.id} run={data.run} categories={data.categories} refresh={load} back={() => selectRun(null)} />
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
                  <Button variant="outline" disabled={data.runs.page <= 1} onClick={() => { query.current = { page: String(data.runs.page - 1) }; void load() }}>{i18n.t('common.previous')}</Button>
                  <span>{i18n.t('common.page', { page: data.runs.page })}</span>
                  <Button variant="outline" disabled={data.runs.page * 20 >= data.runs.total} onClick={() => { query.current = { page: String(data.runs.page + 1) }; void load() }}>{i18n.t('common.next')}</Button>
                </div>
              </section>
            )}
          </TabsContent>
        </div>
      </Tabs> : null}
      <Dialog open={photo !== null} onOpenChange={open => { if (!open) setPhoto(null) }}>
        <DialogContent className="evidence-dialog">
          <DialogHeader><DialogTitle>{photo?.title}</DialogTitle><DialogDescription>{i18n.t('samples.editHint')}</DialogDescription></DialogHeader>
          {photo?.photoDataUrl ? <img className="evidence-photo" src={photo.photoDataUrl} alt={photo.title} /> : <p>{i18n.t('detail.noPhoto')}</p>}
          <Choice label={i18n.t('samples.reference')} value={reference} disabled={saving}
            onChange={setReference} options={data.categories.map(category => ({ value: category.id, label: i18n.label(category.label, category.id) }))} />
          <Button disabled={saving} onClick={() => void saveReference()}>{i18n.t('samples.saveReference')}</Button>
          {notice ? <p role="alert">{notice}</p> : null}
        </DialogContent>
      </Dialog>
    </main>
  )
}

const container = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))
createRoot(container).render(<RemoteI18nProvider i18n={i18n}><Workbench /></RemoteI18nProvider>)
