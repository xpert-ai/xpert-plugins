import * as React from 'react'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsField } from '@xpert-ai/contracts'
import { Button, Input, Label, Textarea, Checkbox, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Plus, Trash2 } from '@xpert-ai/plugin-shadcn-ui'
import { datasetDefinitionSchema, datasetRecordSchema, type LibraryData, type DatasetRecord } from '../lib/library.schema'
import { dashboardSchema } from '../lib/dashboard.schema'
import { dashboardSummarySchema } from '../lib/dashboard-view.schema'
import { renderDatasetSchema } from '../lib/source-executions'
import { libraryAction } from './library-gateway'
import { DatasetPreview } from './dataset-preview'
import type { messages } from './i18n'

type Source = LibraryData['sources'][number]
export function DatasetEditor({ t, data, record, source, onClose, onSaved }: { t: ReturnType<typeof messages>; data: LibraryData; record?: DatasetRecord; source?: Source; onClose(): void; onSaved(record: DatasetRecord): Promise<void> }) {
  const initialSource = source ?? data.sources[0]
  const [name, setName] = React.useState(record?.name ?? ''), [description, setDescription] = React.useState(record?.description ?? '')
  const [binding, setBinding] = React.useState<AnalyticsBinding>(record?.definition.binding ?? emptyBinding(initialSource))
  const [payload, setPayload] = React.useState(JSON.stringify(binding.payload, null, 2))
  const [controls, setControls] = React.useState(JSON.stringify(record?.definition.controls ?? {}, null, 2))
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
  const [result, setResult] = React.useState<z.infer<typeof renderDatasetSchema>>()
  const [dashboards, setDashboards] = React.useState<z.infer<typeof dashboardSummarySchema>[]>([]), [dashboard, setDashboard] = React.useState<z.infer<typeof dashboardSchema>>()
  const [dashboardId, setDashboardId] = React.useState(''), [showReuse, setShowReuse] = React.useState(false)
  const identity = React.useRef(record?.definition.id ?? crypto.randomUUID())
  function change(next: AnalyticsBinding) { setBinding(next); setPayload(JSON.stringify(next.payload, null, 2)); setResult(undefined) }
  const selectedSource = data.sources.find(item => JSON.stringify(item.source) === JSON.stringify(binding.source))
  async function work(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e instanceof Error ? e.message : t.error) } finally { setBusy(false) } }
  function definition() { return datasetDefinitionSchema.parse({ schema: 'xpert.live-dashboard.dataset', id: identity.current, name, description, binding: { ...binding, payload: JSON.parse(payload) }, controls: JSON.parse(controls) }) }
  const updateField = (index: number, patch: Partial<AnalyticsField>) => { setBinding(current => ({ ...current, output: { ...current.output, fields: current.output.fields.map((field, i) => i === index ? { ...field, ...patch } : field) } })); setResult(undefined) }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-4xl" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{record ? t.libEditDataset : t.libCreateDataset}</DialogTitle><DialogDescription>{t.libDatasetEditorHint}</DialogDescription></DialogHeader>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      {!record && <section className="space-y-3 border-b pb-4"><Button variant="outline" disabled={busy} onClick={() => void work(async () => { setShowReuse(true); setDashboards((await libraryAction('dashboard-bindings', {}, z.object({ items: z.array(dashboardSummarySchema) }))).items) })}>{t.libReuseQuery}</Button>
        {showReuse && <div className="grid gap-3 sm:grid-cols-2"><Select value={dashboardId || '__none__'} disabled={busy} onValueChange={value => { if (value === '__none__') return; setDashboardId(value); void work(async () => setDashboard(await libraryAction('dashboard-bindings', { artifactId: value }, dashboardSchema))) }}><SelectTrigger aria-label={t.libChooseDashboard}><SelectValue placeholder={t.libChooseDashboard}/></SelectTrigger><SelectContent><SelectItem value="__none__">{t.libChooseDashboard}</SelectItem>{dashboards.map(item => <SelectItem key={item.artifactId} value={item.artifactId}>{item.title ?? item.artifactId}</SelectItem>)}</SelectContent></Select>
          {dashboard && <Select value="__none__" onValueChange={value => { const query = dashboard.bindings.find(item => item.id === value); if (query) { change(query); if (!name) setName(dashboard.title); setControls(JSON.stringify(Object.fromEntries(dashboard.controls.map(item => [item.controlId, item.defaultValue ?? null])), null, 2)) } }}><SelectTrigger aria-label={t.libChooseQuery}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">{t.libChooseQuery}</SelectItem>{dashboard.bindings.map(item => <SelectItem key={item.id} value={item.id}>{item.output.datasetId}</SelectItem>)}</SelectContent></Select>}</div>}
      </section>}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dataset-name">{t.libDatasetName}</Label><Input id="dataset-name" value={name} disabled={busy} onChange={e => setName(e.target.value)}/></div><div className="space-y-2"><Label htmlFor="dataset-description">{t.libDescription}</Label><Input id="dataset-description" value={description} disabled={busy} onChange={e => setDescription(e.target.value)}/></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t.libSource}</Label><Select value={selectedSource ? String(data.sources.indexOf(selectedSource)) : '__none__'} disabled={busy} onValueChange={value => { if (value !== '__none__') { change(emptyBinding(data.sources[Number(value)])); setControls('{}') } }}><SelectTrigger aria-label={t.libSource}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">{t.libChooseSource}</SelectItem>{data.sources.map((item,i) => <SelectItem key={i} value={String(i)}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>{t.libQueryMethod}</Label><Select value={binding.providerId || '__none__'} disabled={busy} onValueChange={value => { const provider = selectedSource?.providers.find(item => item.id === value); if (provider?.operations[0]) change({ ...binding, providerId: value, operation: provider.operations[0].name, contractVersion: provider.operations[0].contractVersion, payload: {} }) }}><SelectTrigger aria-label={t.libQueryMethod}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">{t.libChooseQuery}</SelectItem>{selectedSource?.providers.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="space-y-2"><Label htmlFor="dataset-query">{t.libQueryConfig}</Label><Textarea id="dataset-query" value={payload} className="min-h-28 font-mono text-xs" disabled={busy} onChange={e => { setPayload(e.target.value); setResult(undefined) }}/></div>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t.libFields}</h3><Button variant="outline" disabled={busy} onClick={() => { let next = binding.output.fields.length + 1; while (binding.output.fields.some(field => field.id === `field${next}`)) next++; const fieldId = `field${next}`; setBinding(current => ({ ...current, output: { ...current.output, fields: [...current.output.fields, { id: fieldId, sourceField: '', label: '', logicalType: 'string', role: 'dimension', nullable: true }] } })); setResult(undefined) }}><Plus/>{t.libAddField}</Button></div>
        {binding.output.fields.map((field,index) => <div key={index} className="grid grid-cols-2 items-end gap-2 border-b pb-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          <div className="space-y-1"><Label htmlFor={`field-source-${index}`}>{t.libSourceField}</Label><Input id={`field-source-${index}`} value={field.sourceField} disabled={busy} onChange={e => updateField(index, { sourceField: e.target.value })}/></div>
          <div className="space-y-1"><Label htmlFor={`field-label-${index}`}>{t.libFieldLabel}</Label><Input id={`field-label-${index}`} value={field.label} disabled={busy} onChange={e => updateField(index, { label: e.target.value })}/></div>
          <div className="space-y-1"><Label>{t.libFieldType}</Label><Select value={field.logicalType} disabled={busy} onValueChange={value => updateField(index, { logicalType: z.enum(['string','boolean','int64','float64','decimal','date','timestamp']).parse(value) })}><SelectTrigger aria-label={`${t.libFieldType} ${index+1}`}><SelectValue/></SelectTrigger><SelectContent>{['string','boolean','int64','float64','decimal','date','timestamp'].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>{t.libFieldRole}</Label><Select value={field.role} disabled={busy} onValueChange={value => updateField(index, { role: z.enum(['dimension','measure','time','identifier']).parse(value) })}><SelectTrigger aria-label={`${t.libFieldRole} ${index+1}`}><SelectValue/></SelectTrigger><SelectContent>{(['dimension','measure','time','identifier'] as const).map(role => <SelectItem key={role} value={role}>{t[({dimension:'libDimension',measure:'libMeasure',time:'libTime',identifier:'libIdentifier'} as const)[role]]}</SelectItem>)}</SelectContent></Select></div>
          <Label className="flex items-center gap-2 whitespace-nowrap"><Checkbox disabled={busy} checked={binding.output.grain.includes(field.id)} onCheckedChange={checked => { setBinding(current => ({ ...current, output: { ...current.output, grain: checked === true ? [...current.output.grain.filter(id => id !== field.id), field.id] : current.output.grain.filter(id => id !== field.id) } })); setResult(undefined) }}/>{t.libGrain}</Label>
          <Button variant="ghost" size="icon" disabled={busy} aria-label={`${t.libRemoveField} ${field.label}`} onClick={() => { setBinding(current => ({ ...current, output: { ...current.output, fields: current.output.fields.filter((_,i) => i !== index), grain: current.output.grain.filter(id => id !== field.id) } })); setResult(undefined) }}><Trash2/></Button>
        </div>)}
        <p className="text-xs text-muted-foreground">{t.libGrainHint}</p>
      </section>
      <details><summary className="text-sm">{t.libParameters}</summary><Label htmlFor="dataset-controls" className="sr-only">{t.libParameters}</Label><Textarea id="dataset-controls" value={controls} disabled={busy} className="mt-2 font-mono text-xs" onChange={e => { setControls(e.target.value); setResult(undefined) }}/></details>
      {result && <DatasetPreview result={result} t={t}/>}
      {error && <div role="alert" className="space-y-2 text-destructive"><p>{t.libInvalidQuery}</p><details className="text-xs"><summary>{t.libErrorDetails}</summary><p className="whitespace-pre-wrap break-all">{error}</p></details></div>}
    </div><DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button><Button variant="outline" disabled={busy || !name.trim() || !binding.output.fields.length} onClick={() => void work(async () => { const value = definition(); setResult(await libraryAction('preview-query', { binding: value.binding, controls: value.controls }, renderDatasetSchema)) })}>{t.libPreview}</Button>
      <Button disabled={busy || !name.trim() || !binding.output.fields.length} onClick={() => void work(async () => { const value = await libraryAction('dataset-save', { definition: definition(), expectedRevision: record?.revision ?? 0, ...(record ? { artifactId: record.artifactId } : {}) }, datasetRecordSchema); await onSaved(value); onClose() })}>{busy ? t.libWorking : t.save}</Button></DialogFooter>
  </DialogContent></Dialog>
}
function emptyBinding(source?: Source): AnalyticsBinding {
  const provider = source?.providers[0], operation = provider?.operations[0]
  return { id: 'dataset', source: source?.source ?? { kind: 'data-source', dataSourceId: '00000000-0000-4000-8000-000000000000' }, providerId: provider?.id ?? '', operation: operation?.name ?? 'query', contractVersion: operation?.contractVersion ?? 1,
    payload: {}, parameters: [], output: { datasetId: 'dataset', fields: [], grain: [] } }
}
