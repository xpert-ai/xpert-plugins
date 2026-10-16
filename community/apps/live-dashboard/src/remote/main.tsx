import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, RefreshCw, Save, Plus } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardSchema, type DashboardManifest } from '../lib/dashboard.schema'
import { startBridge, requestHost } from './bridge'
import { messages } from './i18n'
import './style.css'
import { HtmlDashboard, type HtmlDashboardHandle } from './html-dashboard'
import { installArtifactDocumentFramePolicy } from '@xpert-ai/plugin-sdk/artifact-document'

installArtifactDocumentFramePolicy(document)

declare global { interface Window { __ANALYTICS_RENDERER_HTML__: string } }
const summarySchema = z.object({ artifactId: z.string(), versionId: z.string().nullish(), versionNumber: z.number().optional(), title: z.string().nullish(), updatedAt: z.string().optional() })
const savedSchema = summarySchema.extend({ manifest: dashboardSchema })
const listSchema = z.object({ meta: z.object({ dashboards: z.array(summarySchema), sources: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })), saved: savedSchema.optional() }) })
const actionSchema = z.object({ success: z.literal(true), data: z.unknown() })
const queryResultSchema = z.object({ payload: z.unknown(), datasets: z.array(z.object({ completeness: z.object({ truncated: z.boolean() }), freshness: z.object({ sourceFetchedAt: z.string() }) })) })
type Summary = z.infer<typeof summarySchema>
type Saved = z.infer<typeof savedSchema>
type ControlValue = string | number | boolean | null

function App() {
  const [t, setMessages] = React.useState(() => messages('en-US'))
  const [list, setList] = React.useState<Summary[]>([])
  const [sources, setSources] = React.useState<z.infer<typeof listSchema>['meta']['sources']>([])
  const [saved, setSaved] = React.useState<Saved | null>(null)
  const [controls, setControls] = React.useState<Record<string, ControlValue>>({})
  const [html, setHtml] = React.useState('')
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [editor, setEditor] = React.useState<string | null>(null)
  const [partial, setPartial] = React.useState(false)
  const requestSequence = React.useRef(0), operationSequence = React.useRef(0)
  const htmlDashboard = React.useRef<HtmlDashboardHandle>(null)

  async function load(artifactId?: string, versionId?: string) {
    const result = listSchema.parse(await requestHost('requestData', { query: { parameters: artifactId ? { artifactId, ...(versionId ? { versionId } : {}) } : {} } })).meta
    setList(result.dashboards); setSources(result.sources)
    return result
  }
  async function query(target: Saved, values: Record<string, ControlValue>) {
    const sequence = ++requestSequence.current
    if (!target.versionId) throw new Error('Missing saved version')
    setHtml(''); setStatus(''); setPartial(false)
    const result = queryResultSchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'query', input: { artifactId: target.artifactId, versionId: target.versionId, controls: values } })).data)
    if (sequence !== requestSequence.current) return
    setHtml(rendererHtml(result.payload)); setPartial(result.datasets.some((dataset) => dataset.completeness.truncated))
    setStatus(result.datasets.map((dataset) => dataset.freshness.sourceFetchedAt).sort()[0] ?? '')
  }
  async function open(artifactId: string, versionId?: string) {
    const sequence = ++requestSequence.current
    setHtml(''); setSaved(null); setEditor(null)
    const target = (await load(artifactId, versionId)).saved
    if (sequence !== requestSequence.current) return
    if (!target) throw new Error('Dashboard is unavailable')
    const defaults = Object.fromEntries(target.manifest.controls.filter((control) => control.defaultValue !== undefined).map((control) => [control.controlId, control.defaultValue ?? null]))
    setSaved(target); setControls(defaults); setStatus(''); setPartial(false)
    if (!target.manifest.presentation) await query(target, defaults)
  }
  async function run(work: () => Promise<void>) {
    const operation = ++operationSequence.current
    setBusy(true); setError('')
    try { await work() } catch (error) { if (operation === operationSequence.current) setError(error instanceof Error ? error.message : t.error) } finally { if (operation === operationSequence.current) setBusy(false) }
  }
  async function openLatest() {
    const result = await load()
    const latest = [...result.dashboards].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
    if (latest) await open(latest.artifactId)
  }
  React.useEffect(() => startBridge((locale) => { setMessages(messages(locale)); void run(async () => { await load() }) },
    (artifactId, versionId) => { void run(() => open(artifactId, versionId)) }), [])

  async function save() {
    const manifest = dashboardSchema.parse(JSON.parse(editor ?? ''))
    const expectedVersionId = saved?.manifest.id === manifest.id ? saved.versionId ?? null : null
    const result = summarySchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'save', input: { manifest, expectedVersionId } })).data)
    await open(result.artifactId, result.versionId ?? undefined)
  }
  return <main className="dashboard-shell">
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <h1 className="text-base font-semibold">{t.title}</h1>
      <Select value={saved?.artifactId ?? ''} onValueChange={(id) => void run(() => open(id))} disabled={busy}>
        <SelectTrigger className="w-60" aria-label={t.select}><SelectValue placeholder={t.select}/></SelectTrigger>
        <SelectContent>{list.map((item) => <SelectItem key={item.artifactId} value={item.artifactId}>{item.title ?? item.artifactId}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex-1"/>
      {saved && <Button variant="outline" disabled={busy} onClick={() => setEditor(JSON.stringify(saved.manifest, null, 2))}>{t.edit}</Button>}
      <Button variant="outline" disabled={busy} onClick={() => setEditor('')}><Plus/>{t.import}</Button>
      <Button disabled={busy} onClick={() => { if (saved?.manifest.presentation) { setError(''); htmlDashboard.current?.refresh() } else void run(async () => { if (saved) { await load(); await query(saved, controls) } else await openLatest() }) }}><RefreshCw/>{t.refresh}</Button>
    </header>
    {error && <div role="alert" className="border-b px-4 py-3 text-destructive">{error}</div>}
    {editor !== null ? <section className="editor-panel p-4">
      <label className="text-sm font-medium" htmlFor="definition">{t.definition}</label>
      <Textarea id="definition" className="min-h-0 flex-1 font-mono text-xs" value={editor} onChange={(event) => setEditor(event.target.value)} disabled={busy}/>
      <details className="text-xs"><summary>{t.sources}</summary><pre className="max-h-32 overflow-auto">{JSON.stringify(sources, null, 2)}</pre></details>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)} disabled={busy}>{t.cancel}</Button><Button onClick={() => void run(save)} disabled={busy || !editor.trim()}><Save/>{t.save}</Button></div>
    </section> : <>
      {saved && <section className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
        {!saved.manifest.presentation && saved.manifest.controls.map((control) => <Filter key={control.controlId} control={control} value={controls[control.controlId] ?? null} disabled={busy} onChange={(value) => setControls((current) => ({ ...current, [control.controlId]: value }))}/>)}
        {!saved.manifest.presentation && !!saved.manifest.controls.length && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => query(saved, controls))}>{t.apply}</Button>}
        <span className="ml-auto text-xs text-muted-foreground">{t.version} {saved.versionNumber} {status && `· ${new Date(status).toLocaleString(document.documentElement.lang)}`}</span>
      </section>}
      {partial && <p role="status" className="px-4 py-2 text-sm">{t.partial}</p>}
      <section className="canvas-panel" aria-busy={busy}>
        {busy && <p role="status" className="p-6 text-muted-foreground">{t.loading}</p>}
        {!busy && !html && !saved?.manifest.presentation && !error && <p className="p-6 text-muted-foreground">{t.empty}</p>}
        {saved?.manifest.presentation && saved.versionId && <HtmlDashboard ref={htmlDashboard} artifactId={saved.artifactId} versionId={saved.versionId}
          manifest={saved.manifest} onBusy={setBusy} onError={setError} onResult={result => { setError(''); setPartial(result.partial); setStatus(result.fetchedAt) }}/ >}
        {html && <iframe title={saved?.manifest.title ?? t.title} sandbox="allow-scripts" srcDoc={html} className="h-full w-full border-0"/>}
      </section>
    </>}
  </main>
}
function Filter({ control, value, onChange, disabled }: { control: DashboardManifest['controls'][number]; value: ControlValue; onChange: (value: ControlValue) => void; disabled: boolean }) {
  return <div className="grid gap-1.5"><label htmlFor={control.controlId} className="text-xs text-muted-foreground">{control.label}</label>
    {control.allowedValues ? <Select value={JSON.stringify(value)} onValueChange={(value) => onChange(z.union([z.string(), z.number(), z.boolean(), z.null()]).parse(JSON.parse(value)))} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent>{control.allowedValues.map((value) => <SelectItem key={JSON.stringify(value)} value={JSON.stringify(value)}>{String(value ?? '—')}</SelectItem>)}</SelectContent>
    </Select> : control.type === 'boolean' ? <Select value={String(value)} onValueChange={(value) => onChange(value === 'true')} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
    </Select> : <Input id={control.controlId} className="w-44" disabled={disabled} type={control.type === 'date' ? 'date' : control.type === 'number' ? 'number' : 'text'} value={value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : control.type === 'number' ? Number(event.target.value) : event.target.value)}/>}
  </div>
}
function rendererHtml(payload: unknown) {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  // The renderer's default fetch shim assumes an HTTP origin. srcDoc is opaque, so provide its
  // three read-only in-memory endpoints before the unchanged renderer bundle initializes.
  const setup = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><script>window.__DATASCIENCE_ARTIFACT_HOSTING__={mode:'site_creator',readOnly:true,controls:{edit:false,exportHostedLink:false,hostedLink:false}};window.xpertai={toolOutput:${json(payload)},toolResponseMetadata:${json(payload)},availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen',hostContext:{availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen'}};
  window.__datascienceArtifactFetchShimInstalled=true;
  window.fetch=async function(input,init){const path=new URL(typeof input==='string'?input:input.url,'https://renderer.invalid').pathname;const payload=window.xpertai.toolOutput;const data={'/api/manifest':payload.manifest,'/api/snapshot':payload.snapshot,'/api/package':{manifestPath:'live dashboard',snapshotPath:'live query'}};const ok=(!init||!init.method||init.method==='GET')&&Object.prototype.hasOwnProperty.call(data,path);return new Response(JSON.stringify(ok?data[path]:{error:'Unavailable in live read-only view'}),{status:ok?200:404,headers:{'Content-Type':'application/json'}})};<\/script>`
  return window.__ANALYTICS_RENDERER_HTML__.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${setup}`)
}
createRoot(document.getElementById('root')!).render(<App/> )
