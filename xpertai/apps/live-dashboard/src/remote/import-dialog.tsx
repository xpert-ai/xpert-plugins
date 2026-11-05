import * as React from 'react'
import { z } from 'zod/v3'
import { analyticsSourceRefSchema, analyticsSourceKey, analyticsBindingObjectSchema } from '@xpert-ai/plugin-sdk/analytics'
import type { AnalyticsSourceRef } from '@xpert-ai/contracts'
import { Button, Input, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Collapsible, CollapsibleTrigger, CollapsibleContent, ChevronDown, Upload } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardSchema } from '../lib/dashboard.schema'
import { requestHost } from './bridge'
import { ImportTargets } from './import-targets'
import type { messages } from './i18n'

const preparedSchema = z.object({ importId: z.string().uuid(), manifest: dashboardSchema,
  requirements: z.object({ externalResources: z.array(z.string()), dynamicResourcesMayExist: z.boolean() }),
  sources: z.array(z.object({ source: analyticsSourceRefSchema, name: z.string(), providers: z.array(z.object({ id: z.string(), operations: z.array(z.object({ name: z.string(), contractVersion: z.number() })) })) }))
})
type Replacement = { source: AnalyticsSourceRef; text: string; title?: string }
export function ImportDialog({ t, onClose, onImported }: { t: ReturnType<typeof messages>; onClose(): void; onImported(id: string): Promise<void> }) {
  const [prepared, setPrepared] = React.useState<z.infer<typeof preparedSchema>>()
  const [replacements, setReplacements] = React.useState<Record<string, Replacement>>({})
  const [selected, setSelected] = React.useState(''), [browsing, setBrowsing] = React.useState(false)
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
  const session = React.useRef<string>(), mounted = React.useRef(true)
  const discard = (importId: string) => requestHost('executeAction', { actionKey: 'import-discard', input: { importId } }).catch(() => undefined)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (session.current) void discard(session.current) } }, [])
  async function upload(file?: File) {
    if (!file) return
    setError(''); setBusy(true); setBrowsing(false)
    try {
      if (file.size > 12_000_000) throw new Error('DASHBOARD_ARCHIVE_TOO_LARGE')
      const data = z.object({ success: z.literal(true), data: preparedSchema }).parse(await requestHost('executeFileAction', {
        actionKey: 'import-preview', input: {}, file: { name: file.name, type: file.type, size: file.size, buffer: await file.arrayBuffer() }
      })).data
      if (!mounted.current) { void discard(data.importId); return }
      if (session.current) await discard(session.current)
      session.current = data.importId
      setPrepared(data); setSelected(data.manifest.bindings[0]?.id ?? '')
      setReplacements(Object.fromEntries(data.manifest.bindings.map(binding => [binding.id, { source: binding.source, text: JSON.stringify(binding.payload, null, 2) }])))
    } catch (reason) { if (mounted.current) setError(`${t.importFailed} ${reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : ''}`) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function commit() {
    if (!prepared) return
    setBusy(true); setError('')
    try {
      const bindings = prepared.manifest.bindings.map(binding => ({ bindingId: binding.id, source: replacements[binding.id].source,
        payload: analyticsBindingObjectSchema.shape.payload.parse(JSON.parse(replacements[binding.id].text)) }))
      const result = z.object({ success: z.literal(true), data: z.object({ artifactId: z.string().uuid() }) }).parse(await requestHost('executeAction', {
        actionKey: 'import-commit', input: { importId: prepared.importId, bindings }
      })).data
      await onImported(result.artifactId)
    } catch (reason) { if (mounted.current) setError(`${t.importValidationFailed} ${reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : ''}`) }
    finally { if (mounted.current) setBusy(false) }
  }
  const binding = prepared?.manifest.bindings.find(item => item.id === selected), replacement = binding && replacements[binding.id]
  const sources = binding ? prepared?.sources.filter(source => source.providers.some(provider => provider.id === binding.providerId && provider.operations.some(operation => operation.name === binding.operation && operation.contractVersion === binding.contractVersion))) ?? [] : []
  const patch = (value: Partial<Replacement>) => { if (binding) setReplacements(current => ({ ...current, [binding.id]: { ...current[binding.id], ...value } })) }
  const parsedPayload = replacement && (() => { try { return { value: analyticsBindingObjectSchema.shape.payload.parse(JSON.parse(replacement.text)) } } catch { return null } })()
  const missing = prepared?.manifest.bindings.filter(item => !prepared.sources.some(source => analyticsSourceKey(source.source) === analyticsSourceKey(replacements[item.id].source) && source.providers.some(provider => provider.id === item.providerId && provider.operations.some(operation => operation.name === item.operation && operation.contractVersion === item.contractVersion)))) ?? []
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="dashboard-import-dialog flex flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onInteractOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12"><DialogTitle>{t.importDashboard}</DialogTitle><DialogDescription>{t.importHint}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label className="grid gap-2 text-sm">{t.importFile}<Input type="file" accept=".zip,.json" disabled={busy} onChange={event => void upload(event.target.files?.[0])}/></label>
        {prepared && <>
          <div><p className="font-medium">{prepared.manifest.title}</p><p className="text-sm text-muted-foreground">{t.importNewDraft}</p></div>
          {prepared.requirements.dynamicResourcesMayExist && <p className="text-sm text-muted-foreground">{t.importOnlineDependencies}</p>}
          {!!missing.length && <p role="status" className="text-sm text-destructive">{t.importMissingSources}: {missing.map(item => item.id).join(', ')}</p>}
          {!!prepared.manifest.bindings.length && <label className="grid gap-2 text-sm">{t.importBinding}
            <Select value={selected} disabled={busy} onValueChange={value => { setSelected(value); setBrowsing(false) }}><SelectTrigger aria-label={t.importBinding}><SelectValue/></SelectTrigger><SelectContent>
              {prepared.manifest.bindings.map(item => <SelectItem key={item.id} value={item.id}>{prepared.manifest.sourceMetadata?.find(meta => meta.bindingId === item.id)?.title ?? item.id}</SelectItem>)}
            </SelectContent></Select>
          </label>}
          {binding && replacement && <div className="space-y-3">
            <label className="grid gap-2 text-sm">{t.importTargetSource}
              <Select value={sources.some(source => analyticsSourceKey(source.source) === analyticsSourceKey(replacement.source)) ? analyticsSourceKey(replacement.source) : '__unavailable'} disabled={busy} onValueChange={value => {
                const source = sources.find(item => analyticsSourceKey(item.source) === value)
                if (source) { patch({ source: source.source, title: undefined }); setBrowsing(false) }
              }}><SelectTrigger aria-label={t.importTargetSource}><SelectValue/></SelectTrigger><SelectContent>
                <SelectItem value="__unavailable" disabled>{t.sourceUnavailable}</SelectItem>{sources.map(item => <SelectItem key={analyticsSourceKey(item.source)} value={analyticsSourceKey(item.source)}>{item.name}</SelectItem>)}
              </SelectContent></Select>
            </label>
            {replacement.title && <p className="text-sm">{t.importTarget}: {replacement.title}</p>}
            <Button variant="outline" disabled={busy || !parsedPayload || missing.some(item => item.id === binding.id)} onClick={() => setBrowsing(value => !value)}>{t.importMapTarget}</Button>
            {browsing && parsedPayload && <ImportTargets key={selected} importId={prepared.importId} binding={{ ...binding, source: replacement.source }} payload={parsedPayload.value} t={t}
              onChoose={(payload, title) => { patch({ text: JSON.stringify(payload, null, 2), title }); setBrowsing(false) }} onCancel={() => setBrowsing(false)}/>}
            <Collapsible><CollapsibleTrigger asChild><Button variant="ghost">{t.importAdvanced}<ChevronDown/></Button></CollapsibleTrigger><CollapsibleContent className="grid gap-2 pt-2">
              <p className="text-xs text-muted-foreground">{t.importPayloadHint}</p><Textarea rows={10} aria-label={t.sourcePayload} className="font-mono text-xs" value={replacement.text} disabled={busy} onChange={event => patch({ text: event.target.value, title: undefined })}/>
            </CollapsibleContent></Collapsible>
          </div>}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">{t.importWorking}</p>}
      </div>
      <DialogFooter className="mx-0 mb-0 shrink-0"><Button variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button><Button disabled={busy || !prepared || !!missing.length} onClick={() => void commit()}><Upload/>{t.importCommit}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
