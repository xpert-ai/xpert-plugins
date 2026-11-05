import * as React from 'react'
import { Button, Badge, Collapsible, CollapsibleTrigger, CollapsibleContent, Sheet, SheetContent, SheetTitle, SheetDescription,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, Textarea, ArrowLeft, X, ChevronDown, Copy, Database } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardComponents, dashboardSources } from '../lib/dashboard-sources'
import type { DashboardManifest } from '../lib/dashboard.schema'
import type { SourceExecution } from '../lib/source-executions'
import type { messages } from './i18n'

export type SourceSelection = { componentId?: string | null; bindingId?: string }
type Props = {
  manifest: DashboardManifest; selection: SourceSelection; executions: Record<string, SourceExecution>
  onSelect(selection: SourceSelection): void; onClose(): void; t: ReturnType<typeof messages>
}
export function SourcesPanel(props: Props) {
  const [narrow, setNarrow] = React.useState(() => window.innerWidth < 900)
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 899px)'), change = () => setNarrow(query.matches)
    query.addEventListener('change', change); return () => query.removeEventListener('change', change)
  }, [])
  if (narrow) return <Sheet open onOpenChange={open => { if (!open) props.onClose() }}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetTitle className="sr-only">{props.t.sources}</SheetTitle><SheetDescription className="sr-only">{props.t.sourcePanelHint}</SheetDescription>
      <SourceContents {...props} drawer/>
    </SheetContent>
  </Sheet>
  return <aside className="sources-panel border-l" aria-label={props.t.sources}><SourceContents {...props}/></aside>
}
function SourceContents({ manifest, selection, executions, onSelect, onClose, t, drawer }: Props & { drawer?: boolean }) {
  const sources = dashboardSources(manifest)
  const source = sources.find(item => item.binding.id === selection.bindingId)
  const component = dashboardComponents(manifest).find(item => item.id === selection.componentId)
  const scoped = selection.componentId === undefined ? sources : sources.filter(item => component?.sources.some(ref => ref.bindingId === item.binding.id))
  const state = source && executions[source.binding.id]
  const heading = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => { heading.current?.focus() }, [selection.bindingId, selection.componentId])
  const date = (value: string) => new Date(value).toLocaleString(document.documentElement.lang)
  const status = (value?: SourceExecution) => value?.state === 'running' ? t.sourceRunning : value?.state === 'failed' ? t.sourceFailed : value?.state === 'succeeded' ? t.sourceSucceeded : t.sourceNotRun
  return <>
    <header className={`flex shrink-0 items-center gap-2 border-b px-4 py-3 ${drawer ? 'pr-12' : ''}`}>
      {(source || selection.componentId !== undefined) && <Button variant="ghost" size="icon" aria-label={t.sourceBack} onClick={() => onSelect(source ? { componentId: selection.componentId } : {})}><ArrowLeft/></Button>}
      <h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate font-semibold">{source?.title ?? component?.title ?? t.sources}</h2>
      {!drawer && <Button variant="ghost" size="icon" aria-label={t.sourceClose} onClick={onClose}><X/></Button>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {!source ? <div className="grid gap-1 p-2">
        {selection.componentId !== undefined && <p className="px-2 py-3 text-sm text-muted-foreground">{scoped.length ? t.sourceComponentHint : t.sourceUnmapped}</p>}
        {!sources.length && <p className="p-4 text-sm text-muted-foreground">{t.sourceEmpty}</p>}
        {scoped.map(item => <div key={item.binding.id} className="space-y-1 p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => onSelect({ ...selection, bindingId: item.binding.id })}>
            <Database/><span className="min-w-0 truncate">{item.title}</span>
          </Button>
          <p className="px-3 text-xs text-muted-foreground">{status(executions[item.binding.id])}</p>
          {executions[item.binding.id]?.result && <time className="block px-3 text-xs text-muted-foreground">{date(executions[item.binding.id].result!.freshness.sourceFetchedAt)}</time>}
        </div>)}
      </div> : <>
        <div className="space-y-3 px-4 py-4">
          {source.description && <p className="text-sm text-muted-foreground">{source.description}</p>}
          <Badge variant={state?.state === 'failed' ? 'destructive' : 'secondary'}>{status(state)}</Badge>
          <dl className="grid gap-2 text-xs"><Pair label="bindingId" value={source.binding.id}/><Pair label="datasetId" value={source.binding.output.datasetId}/></dl>

        </div>
        {source.components.length > 0 && <Section title={`${t.sourceUsedBy} (${source.components.length})`}><ul className="list-inside list-disc text-sm text-muted-foreground">{source.components.map(item => <li key={item.id}>{item.title}</li>)}</ul></Section>}
        <Section title={t.sourceQuery} open>
          <dl className="grid gap-2 text-xs"><Pair label="providerId" value={source.binding.providerId}/><Pair label="operation" value={source.binding.operation}/><Pair label="contractVersion" value={String(source.binding.contractVersion)}/></dl>
          <JsonConfig label={t.sourceReference} value={source.binding.source} t={t}/><JsonConfig label={t.sourcePayload} value={source.binding.payload} t={t}/>
        </Section>
        <Section title={t.sourceParameters}>
          <p className="text-xs text-muted-foreground">{t.sourceParametersHint}</p>
          {source.binding.parameters.map(parameter => <div key={parameter.name} className="space-y-1 border-b py-2 text-xs">
            <p className="font-medium">{manifest.controls.find(control => control.controlId === parameter.controlId)?.label ?? parameter.controlId}</p>
            <dl className="grid gap-1"><Pair label="name" value={parameter.name}/><Pair label="controlId" value={parameter.controlId}/><Pair label="type" value={parameter.type}/><Pair label="required" value={String(parameter.required)}/>
              <Pair label={t.sourceDefault} value={JSON.stringify(parameter.defaultValue) ?? '—'}/>
              <Pair label={t.sourceCurrent} value={state ? JSON.stringify(Object.hasOwn(state.controls, parameter.controlId) ? state.controls[parameter.controlId] : parameter.defaultValue ?? null) : t.sourceNotRun}/>
            </dl>
            {parameter.allowedValues && <JsonConfig label="allowedValues" value={parameter.allowedValues} t={t}/>}</div>)}
          {!source.binding.parameters.length && <p className="text-sm text-muted-foreground">{t.sourceNoParameters}</p>}
        </Section>
        <Section title={t.sourceOutput}>
          <JsonConfig label="grain" value={source.binding.output.grain} t={t}/>
          {source.binding.output.fields.map(field => <div key={field.id} className="border-b py-2"><p className="text-sm font-medium">{field.label}</p><JsonConfig label={field.id} value={field} t={t}/></div>)}
        </Section>
        <Section title={t.sourceResult}>
          {state?.requestedAt && <p className="text-xs text-muted-foreground">{t.sourceRequested} {date(state.requestedAt)}</p>}
          {state?.state === 'failed' && <p role="status" className="text-sm text-destructive">{t.sourceFailureHint}</p>}
          {state?.result ? <>
            {state.state !== 'succeeded' && <p className="text-sm text-muted-foreground">{t.sourcePreviousResult}</p>}
            <JsonConfig label={t.sourceResultMeta} value={{ completeness: state.result.completeness, freshness: state.result.freshness, provenance: state.result.provenance, controls: state.resultControls }} t={t}/>
            <p className="text-xs text-muted-foreground">{t.sourcePreviewLimit}</p>
            <div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow>{state.result.fields.map(field => <TableHead key={field.id}>{field.label ?? field.id}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{state.result.rows.map((row, index) => <TableRow key={index}>{state.result!.fields.map(field => <TableCell key={field.id} className="whitespace-nowrap">{JSON.stringify(row[field.id]) ?? '—'}</TableCell>)}</TableRow>)}</TableBody></Table></div>
          </> : <p className="text-sm text-muted-foreground">{t.sourceNotRun}</p>}
        </Section>
      </>}
    </div>
  </>
}
function Pair({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2"><dt className="break-words text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>
}
function Section({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return <Collapsible defaultOpen={open} className="border-t"><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between">{title}<ChevronDown/></Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-3 px-4 pb-4">{children}</CollapsibleContent></Collapsible>
}
export function JsonConfig({ label, value, t }: { label: string; value: object | string | number | boolean | null; t: ReturnType<typeof messages> }) {
  const input = React.useRef<HTMLTextAreaElement>(null), [copied, setCopied] = React.useState(false)
  return <div className="grid gap-1"><div className="flex items-center justify-between gap-2"><span className="break-all text-xs text-muted-foreground">{label}</span>
    <Button variant="ghost" size="icon" aria-label={`${t.sourceCopy}: ${label}`} title={copied ? t.sourceCopied : t.sourceCopy} onClick={() => { input.current?.focus(); input.current?.select(); setCopied(document.execCommand('copy')) }}><Copy/></Button></div>
    <Textarea ref={input} readOnly aria-label={label} value={JSON.stringify(value, null, 2)} rows={Math.min(10, JSON.stringify(value, null, 2).split('\n').length + 1)} className="max-h-72 resize-y font-mono text-xs"/>
  </div>
}
