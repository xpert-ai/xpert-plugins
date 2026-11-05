import * as React from 'react'
import { z } from 'zod/v3'
import { analyticsOptionsSchema, analyticsBindingObjectSchema, analyticsDiscoveryResultSchema } from '@xpert-ai/plugin-sdk/analytics'
import { Button, ArrowLeft, ChevronRight, Input } from '@xpert-ai/plugin-shadcn-ui'
import type { AnalyticsBinding, JSONValue } from '@xpert-ai/contracts'
import { requestHost } from './bridge'
import type { messages } from './i18n'

const extensionSchema = z.object({ 'x-xpert-import': z.object({ version: z.literal(1), request: analyticsOptionsSchema }).strict() })
const targetSchema = z.object({ schema: z.literal('xpert.analytics.import-target'), version: z.literal(1), payloadPatch: analyticsOptionsSchema }).strict()
export function ImportTargets({ importId, binding, payload, t, onChoose, onCancel }: {
  importId: string; binding: AnalyticsBinding; payload: JSONValue; t: ReturnType<typeof messages>
  onChoose(payload: JSONValue, title: string): void; onCancel(): void
}) {
  const [result, setResult] = React.useState<z.infer<typeof analyticsDiscoveryResultSchema>>()
  const [history, setHistory] = React.useState<JSONValue[]>([])
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [search, setSearch] = React.useState('')
  const sequence = React.useRef(0)
  async function browse(request: JSONValue, nextHistory: JSONValue[], initialize = false) {
    const current = ++sequence.current
    setBusy(true); setError('')
    try {
      const response = z.object({ success: z.literal(true), data: analyticsDiscoveryResultSchema }).parse(await requestHost('executeAction', {
        actionKey: 'import-browse', input: { importId, bindingId: binding.id, source: binding.source, request }
      })).data
      if (current !== sequence.current) return
      if (initialize) {
        const extension = extensionSchema.safeParse(response.queryContract.payloadSchema)
        if (!extension.success) { setError(t.importManualPayload); return }
        const initial = { ...extension.data['x-xpert-import'].request, payload }
        await browse(initial, [initial]); return
      }
      setResult(response); setHistory(nextHistory); setSearch('')
    } catch { if (current === sequence.current) setError(t.importBrowseFailed) }
    finally { if (current === sequence.current) setBusy(false) }
  }
  React.useEffect(() => { void browse({}, [], true); return () => { ++sequence.current } }, [importId, binding.id, JSON.stringify(binding.source)])
  const items = result?.items.filter(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? []
  return <div className="space-y-3 border-t pt-3">
    <div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label={t.sourceBack} disabled={busy} onClick={() => {
      if (history.length < 2) onCancel(); else { const next = history.slice(0, -1); void browse(next.at(-1)!, next) }
    }}><ArrowLeft/></Button><p className="text-sm font-medium">{t.importChooseTarget}</p></div>
    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t.importSearchPage} aria-label={t.importSearchPage}/>
    {busy && <p role="status" className="text-sm text-muted-foreground">{t.sourceRunning}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid max-h-60 gap-1 overflow-y-auto">
      {items.map(item => {
        const target = targetSchema.safeParse(item.metadata)
        return <Button key={item.id} variant="outline" className="justify-between" disabled={busy || !target.success && !item.inspectRequest} onClick={() => {
          if (target.success) onChoose(analyticsBindingObjectSchema.shape.payload.parse({ ...analyticsOptionsSchema.parse(payload), ...target.data.payloadPatch }), item.name)
          else if (item.inspectRequest) void browse(item.inspectRequest, [...history, item.inspectRequest])
        }}><span className="truncate">{item.name}</span><ChevronRight/></Button>
      })}
      {!busy && !items.length && !error && <p className="text-sm text-muted-foreground">{t.importNoTargets}</p>}
    </div>
    {result?.nextRequest && <Button variant="outline" disabled={busy} onClick={() => void browse(result.nextRequest!, [...history.slice(0, -1), result.nextRequest!])}>{t.importNextPage}</Button>}
  </div>
}
