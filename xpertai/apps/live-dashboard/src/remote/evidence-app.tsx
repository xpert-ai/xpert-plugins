import * as React from 'react'
import { z } from 'zod/v3'
import { Button, Input, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@xpert-ai/plugin-shadcn-ui'
import { parseAnalysisEvidence } from '@xpert-ai/plugin-sdk/analytics'
import { captureViewScope, requestHost, startBridge } from './bridge'
import { messages } from './i18n'
import { compareEvidence } from '../lib/evidence/evidence-diff'

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const originSchema = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid(), controls: z.record(scalar).default({}), title: z.string().optional() })
const querySchema = z.object({ selectionId: z.string().uuid().optional(), parameters: z.object({
  artifactId: z.string().uuid().optional(), versionId: z.string().uuid().optional(), controls: z.record(scalar).optional(), title: z.string().optional()
}).passthrough().optional() })
const dataSchema = z.object({ meta: z.object({ canCapture: z.boolean().optional(), refreshId: z.string().uuid().optional(), sourceChanged: z.boolean().optional(), snapshot: z.unknown().transform(value => value === undefined ? undefined : parseAnalysisEvidence(value)), items: z.array(z.object({ id: z.string().uuid(), title: z.string(), capturedAt: z.string() })).optional() }) })
const actionData = z.object({ success: z.literal(true), data: z.unknown() })
export function EvidenceApp() {
  const [t, setT] = React.useState(() => messages('en-US')), [data, setData] = React.useState<z.infer<typeof dataSchema>['meta']>({})
  const [origin, setOrigin] = React.useState<z.infer<typeof originSchema>>(), [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState(true), [error, setError] = React.useState('')
  const [comparison, setComparison] = React.useState<ReturnType<typeof compareEvidence>>()
  const navigation = React.useRef(''), sequence = React.useRef(0), generation = React.useRef(0), requests = React.useRef(new Map<string, string>())
  async function run(work: () => Promise<void>) {
    const current = generation.current; setBusy(true); setError('')
    try { await work() } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function load(id?: string) {
    const assertScope = captureViewScope(), current = ++sequence.current
    const result = dataSchema.parse(await requestHost('requestData', { query: id ? { selectionId: id } : {} })).meta
    assertScope(); if (current !== sequence.current) return; setData(result)
    if (result.snapshot) { setOrigin({ ...result.snapshot.source, controls: result.snapshot.controls }); setTitle(result.snapshot.title) }
    return result.snapshot
  }
  React.useEffect(() => startBridge((locale, raw) => {
    setT(messages(locale)); const query = querySchema.safeParse(raw ?? {})
    if (!query.success) { setError('EVIDENCE_NAVIGATION_INVALID'); setBusy(false); return }
    const key = JSON.stringify(query.data)
    if (key === navigation.current) return
    navigation.current = key
    setComparison(undefined)
    const source = originSchema.safeParse(query.data.parameters)
    setOrigin(source.success ? source.data : undefined); setTitle(source.success ? source.data.title ?? '' : '')
    void run(async () => { await load(query.data.selectionId) })
  }, () => {}, () => { generation.current++; sequence.current++; navigation.current = ''; requests.current.clear(); setData({}); setComparison(undefined); setOrigin(undefined); setTitle(''); setError(''); setBusy(true) }), [])
  const requestId = (key: string) => { const id = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, id); return id }
  async function capture() {
    const previous = data.snapshot, refreshId = previous?.id ?? data.refreshId
    if (!origin && !refreshId) return
    const assertScope = captureViewScope(), input = refreshId ? { id: refreshId, title } : { artifactId: origin!.artifactId, versionId: origin!.versionId, controls: origin!.controls, title }
    const key = JSON.stringify(input)
    const receipt = z.object({ id: z.string().uuid() }).parse(actionData.parse(await requestHost('executeAction', {
      actionKey: refreshId ? 'refresh' : 'capture', input: { ...input, requestId: requestId(key) } })).data)
    assertScope(); requests.current.delete(key); const next = await load(receipt.id)
    assertScope(); setComparison(previous && next ? compareEvidence(previous, next) : undefined)
  }
  async function convert(target: 'document' | 'presentation' | 'motion') {
    if (!data.snapshot) return
    const assertScope = captureViewScope(), key = `${data.snapshot.id}:${target}:${title}`
    const result = z.object({ resourceRef: z.object({ providerKey: z.string(), resourceId: z.string() }) }).parse(actionData.parse(await requestHost('executeAction', {
      actionKey: 'convert', input: { id: data.snapshot.id, target, title, requestId: requestId(key) } })).data)
    assertScope()
    const resolved = z.object({ success: z.literal(true), navigation: z.object({ target: z.literal('workbench.view'), viewKey: z.string(), selectionId: z.string().optional(), parameters: z.record(z.unknown()).optional() }) })
      .parse(await requestHost('invokeClientCommand', { commandKey: 'workbench.content.resolve', payload: result.resourceRef }))
    assertScope(); await requestHost('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: resolved.navigation })
  }
  return <main className="flex h-full flex-col overflow-auto p-5 gap-4" aria-busy={busy}>
    <header><h1 className="text-lg font-semibold">{t.evidenceTitle}</h1><p className="text-muted-foreground">{t.evidenceIntro}</p></header>
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    {busy && <p role="status">{t.libWorking}</p>}
    {(origin || data.refreshId) && <section className="space-y-3 border-b pb-4">
      <Input aria-label={t.evidenceName} value={title} onChange={e => setTitle(e.target.value)} maxLength={200}/>
      {origin && <><p className="break-all text-muted-foreground">{t.evidenceSource}: {origin.artifactId} / {origin.versionId}</p>
      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(origin.controls, null, 2)}</pre></>}
      {data.sourceChanged && <p role="status">{t.evidenceSourceChanged}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !data.canCapture || !title.trim()} onClick={() => void run(capture)}>{data.snapshot || data.refreshId ? t.evidenceRecapture : t.evidenceCapture}</Button>
        {data.snapshot && <><Button variant="outline" disabled={busy || !data.canCapture || !title.trim()} onClick={() => void run(() => convert('document'))}>{t.evidenceDocument}</Button>
          <Button variant="outline" disabled={busy || !data.canCapture || !title.trim()} onClick={() => void run(() => convert('presentation'))}>{t.evidencePresentation}</Button>
          <Button variant="outline" disabled={busy || !data.canCapture || !title.trim()} onClick={() => void run(() => convert('motion'))}>{t.evidenceMotion}</Button></>}</div>
      <p className="text-muted-foreground">{t.evidenceCopies}</p>
    </section>}
    {comparison && <section aria-label={t.evidenceChanges} className="space-y-2 border rounded p-3">
      <h2 className="font-semibold">{t.evidenceChanges}: {comparison.changedCells} · {t.evidenceStructureChanges}: {comparison.changedDatasets}</h2>
      <p>{t.evidenceComparisonNote}</p>
      <p className="break-all">{comparison.previousId} → {comparison.currentId}</p>
      <Table><TableHeader><TableRow><TableHead>{t.evidenceSource}</TableHead><TableHead>{t.evidenceBefore}</TableHead><TableHead>{t.evidenceAfter}</TableHead></TableRow></TableHeader>
        <TableBody>{comparison.changes.map(change => <TableRow key={`${change.datasetId}:${change.row}:${change.field}`}><TableCell>{change.datasetId}:{change.row + 1}:{change.field}</TableCell><TableCell>{change.before}</TableCell><TableCell>{change.after}</TableCell></TableRow>)}</TableBody></Table>
    </section>}
    {data.snapshot && <section className="space-y-4">
      <p className="break-all">{t.evidenceCaptured}: {data.snapshot.capturedAt}<br/>SHA-256: {data.snapshot.sha256}</p>
      {data.snapshot.datasets.map(dataset => <section key={dataset.datasetId} className="space-y-2">
        <h2 className="font-semibold">{dataset.datasetId}</h2>
        <p>{t.evidenceCompleteness}: {dataset.completeness.returnedRows} / {dataset.completeness.totalRows ?? '—'} · {dataset.completeness.scope} · {dataset.completeness.totalAccuracy}</p>
        <p>{t.evidenceQueryTime}: {dataset.freshness.executedAt}</p>
        {dataset.provenance.certification && <p>{t.evidenceCertification}: {JSON.stringify(dataset.provenance.certification)}</p>}
        <Table><TableHeader><TableRow>{dataset.fields.map(field => <TableHead key={field.id}>{field.label}{field.unit ? ` (${field.unit})` : ''}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{dataset.rows.map((row, index) => <TableRow key={index}>{dataset.fields.map(field => <TableCell key={field.id} title={`${dataset.datasetId}:${index}:${field.id}`}>{row[field.id] === null ? '—' : String(row[field.id])}</TableCell>)}</TableRow>)}</TableBody></Table>
      </section>)}
    </section>}
    {!origin && !data.snapshot && <p>{t.evidenceEmpty}</p>}
    {data.items?.map(item => <Button key={item.id} variant="outline" disabled={busy} className="justify-start" onClick={() => void run(async () => { setComparison(undefined); await load(item.id) })}>{item.title} · {item.capturedAt}</Button>)}
  </main>
}
