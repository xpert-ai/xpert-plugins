import * as React from 'react'
import { z } from 'zod/v3'
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@xpert-ai/plugin-shadcn-ui'
import { resourceV2Schema } from '../lib/library/resource-contract'
import { instantiateSchema, taskDraftV2Schema } from '../lib/library/execution-contract'
import { datasetRecordSchema, type DatasetRecord, type LibraryData } from '../lib/library.schema'
import type { DirectoryItem } from '../lib/library/directory-contract'
import { libraryAction, libraryCommand, useResourceTask } from './library-gateway'
import { captureViewScope, requestHost } from './bridge'
import { ResourceImage } from './resource-image'
import type { messages } from './i18n'
const detailSchema = z.object({ document: resourceV2Schema, capabilities: z.object({ canExport: z.boolean(), canPublish: z.boolean(), canWithdraw: z.boolean(), reasons: z.array(z.string()) }),
  execution: z.object({ supportsInstantiation: z.boolean(), canPrepareTask: z.boolean(), reasons: z.array(z.string()) }) })
type T = ReturnType<typeof messages>
/** @beta Fixed-version resource details and composer preparation; never sends or executes a task. */
export function ResourceDetail({ item, t, data, onClose, onChanged }: { item: DirectoryItem; t: T; data: LibraryData; onClose(): void; onChanged(): void }) {
  const [detail, setDetail] = React.useState<z.infer<typeof detailSchema>>(), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
  const [title, setTitle] = React.useState(item.title), [publish, setPublish] = React.useState(false), [inserted, setInserted] = React.useState(false)
  const [inputs, setInputs] = React.useState<Record<string, { record: DatasetRecord; mapping: Record<string,string> }>>({})
  const [parameters, setParameters] = React.useState<Record<string, string|number|boolean|null>>({})
  const intent = React.useRef<string>(), lock = React.useRef(false), alive = React.useRef(true)
  React.useEffect(() => { alive.current = true
    if (item.releaseId) libraryAction('resource-open', { releaseId: item.releaseId }, detailSchema).then(value => { if (alive.current) setDetail(value) }, error => { if (alive.current) setError(error.message) })
    return () => { alive.current = false }
  }, [item.releaseId])
  async function run(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError('')
    try { await work() } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : t.error) }
    finally { lock.current = false; if (alive.current) setBusy(false) } }
  const template = detail?.document.kind === 'analysis-template' ? detail.document : undefined
  const ready = template && template.content.inputSlots.every(slot => inputs[slot.key] && slot.fields.every(field => !field.required || inputs[slot.key].mapping[field.role]))
  async function use() {
    if (!item.releaseId) return
    intent.current ??= crypto.randomUUID()
    if (detail?.document.kind === 'example-task') await useResourceTask(item.releaseId, intent.current)
    else if (template) {
      const request = instantiateSchema.parse({ releaseId: item.releaseId, requestId: intent.current, title, parameters,
        inputs: template.content.inputSlots.map(slot => ({ slot: slot.key, mapping: inputs[slot.key].mapping,
          source: { type: 'dataset', artifactId: inputs[slot.key].record.artifactId, revision: inputs[slot.key].record.revision } })) })
      const assertCurrent = captureViewScope(), draft = await libraryAction('resource-prepare-template', request, taskDraftV2Schema)
      assertCurrent(); await libraryCommand('assistant.composer.insert', { ...draft, text: t.v2TemplatePrompt.replace('{title}', title) })
    }
    if (alive.current) setInserted(true)
  }
  function changed() { intent.current = undefined; setInserted(false) }
  const blocked = [...(detail?.execution.reasons ?? []), ...(detail?.capabilities.reasons ?? [])]
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="dashboard-import-dialog overflow-y-auto">
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>{item.description}</DialogDescription></DialogHeader>
    {(item.coverKey || item.coverAssetId) && <div className="mx-auto w-full max-w-lg overflow-hidden rounded-xl"><ResourceImage item={item}/></div>}
    {item.state !== 'released' ? <section className="space-y-3 border-t pt-4"><Badge variant="outline">{item.state === 'planned' ? t.shellPlanned : t.v2NotInstalled}</Badge><p className="text-sm text-muted-foreground">{item.state === 'planned' ? t.shellPlaceholderHint : t.v2InstallHint}</p>{item.features.map(feature => <Badge className="mr-2" variant="secondary" key={feature}>{feature}</Badge>)}</section> : !detail && !error ? <p role="status">{t.libWorking}</p> : detail && <>
      <p className="text-sm text-muted-foreground">{detail.document.version} · {detail.document.license.identifier}</p>
      {detail.document.kind === 'public-dataset' && <p className="text-sm">{t.v2DatasetColumns.replace('{count}', String(detail.document.content.columns.length))} · {detail.document.provenance.description}</p>}
      {!!detail.document.dependencies.length && <section className="space-y-2"><h3 className="text-sm font-medium">{t.v2Dependencies}</h3>{detail.document.dependencies.map(dep => <p className="text-sm text-muted-foreground" key={dep.alias}>{dep.alias} · {dep.version}</p>)}</section>}
      {template && <section className="space-y-4 border-t pt-4"><p className="text-sm text-muted-foreground">{t.v2MappingHint}</p>
        <label className="grid gap-2 text-sm">{t.catalogTitle}<Input value={title} disabled={busy || !data.canEdit} onChange={event => { setTitle(event.target.value); changed() }}/></label>
        {template.content.inputSlots.map(slot => <fieldset key={slot.key} className="space-y-3"><legend className="mb-2 text-sm font-medium">{slot.key}</legend>
          <Select disabled={busy || !data.canEdit} value={inputs[slot.key]?.record.artifactId ?? '__none'} onValueChange={id => void run(async () => { const record = await libraryAction('dataset-open', { artifactId: id }, datasetRecordSchema); if (alive.current) { setInputs(previous => ({ ...previous, [slot.key]: { record, mapping: {} } })); changed() } })}><SelectTrigger aria-label={`${t.libDataset} · ${slot.key}`}><SelectValue placeholder={t.libDataset}/></SelectTrigger><SelectContent><SelectItem value="__none" disabled>{t.libDataset}</SelectItem>{data.datasets.map(dataset => <SelectItem value={dataset.artifactId} key={dataset.artifactId}>{dataset.name}</SelectItem>)}</SelectContent></Select>
          {inputs[slot.key] && <div className="grid gap-3 sm:grid-cols-2">{slot.fields.map(field => <label key={field.role} className="grid gap-2 text-sm">{field.label}{field.required ? ' *' : ''}<Select disabled={busy} value={inputs[slot.key].mapping[field.role] ?? '__none'} onValueChange={id => { setInputs(previous => { const mapping = { ...previous[slot.key].mapping }; if (id === '__none') delete mapping[field.role]; else mapping[field.role] = id; return { ...previous, [slot.key]: { ...previous[slot.key], mapping } } }); changed() }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none">{t.catalogNotMapped}</SelectItem>{inputs[slot.key].record.definition.binding.output.fields.filter(actual => actual.logicalType === field.logicalType && (field.nullable || !actual.nullable)).map(actual => <SelectItem key={actual.id} value={actual.id}>{actual.label}</SelectItem>)}</SelectContent></Select></label>)}</div>}
        </fieldset>)}
        {template.content.parameters.map(parameter => {
          const value = Object.hasOwn(parameters, parameter.key) ? parameters[parameter.key] : parameter.defaultValue
          const options = parameter.allowedValues ?? (parameter.type === 'boolean' ? [true, false] : undefined)
          const update = (value: string | number | boolean | null) => { setParameters(previous => ({ ...previous, [parameter.key]: value })); changed() }
          return <label key={parameter.key} className="grid gap-2 text-sm">{parameter.label}{options
            ? <Select disabled={busy || !data.canEdit} value={JSON.stringify(value)} onValueChange={value => update(JSON.parse(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{options.map(option => <SelectItem value={JSON.stringify(option)} key={JSON.stringify(option)}>{String(option)}</SelectItem>)}</SelectContent></Select>
            : <Input disabled={busy || !data.canEdit} type={parameter.type === 'number' ? 'number' : parameter.type === 'date' ? 'date' : 'text'} value={String(value ?? '')} onChange={event => update(parameter.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)}/>}</label>
        })}
      </section>}
      {blocked.map(reason => <p className="break-words text-sm text-muted-foreground" key={reason}>{reason}</p>)}
    </>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}{inserted && <p role="status" className="text-sm">{t.exploreReady}</p>}
    <DialogFooter className="flex-wrap gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t.shellClose}</Button>
      {item.releaseId && detail?.capabilities.canExport && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const grant = z.object({ url: z.string().url(), fileName: z.string() }).parse(await requestHost('requestFileAccess', { fileKey: `library-v2/${item.releaseId}`, purpose: 'download' })); const a = document.createElement('a'); a.href = grant.url; a.download = grant.fileName; a.rel = 'noopener'; a.click() })}>{t.catalogExport}</Button>}
      {data.canEdit && detail?.capabilities.canPublish && <Button variant="outline" disabled={busy} onClick={() => setPublish(true)}>{t.catalogPublish}</Button>}
      {data.canEdit && detail?.capabilities.canWithdraw && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await libraryAction('resource-withdraw', { releaseId: item.releaseId }, z.object({ releaseId: z.string() })); onChanged(); onClose() })}>{t.catalogUnpublish}</Button>}
      {detail && (detail.document.kind === 'example-task' || template) && <Button disabled={!data.canEdit || busy || inserted || (template ? !ready || !title.trim() || !detail.execution.supportsInstantiation : !detail.execution.canPrepareTask)} onClick={() => void run(use)}>{t.exploreUse}</Button>}
    </DialogFooter>
    <AlertDialog open={publish} onOpenChange={setPublish}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.catalogPublish}</AlertDialogTitle><AlertDialogDescription>{t.catalogPublishWarning}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel><Button disabled={busy} onClick={() => void run(async () => { await libraryAction('resource-publish', { releaseId: item.releaseId, confirmed: true }, z.object({})); setPublish(false); onChanged(); onClose() })}>{t.catalogConfirmPublish}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </DialogContent></Dialog>
}
