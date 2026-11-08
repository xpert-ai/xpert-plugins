import * as React from 'react'
import { z } from 'zod/v3'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@xpert-ai/plugin-shadcn-ui'
import { requestHost, captureViewScope } from './bridge'
import type { messages } from './i18n'
import type { ResourceAnalysisPolicy } from '@xpert-ai/contracts'
import { GroupAnalysisPolicy } from './group-analysis-policy'

function manage(actionKey: string, input: object) {
  return requestHost('invokeClientCommand', { commandKey: 'artifact.use-grants.manage', payload: { actionKey, input } })
}

const targetsSchema = z.object({ success: z.literal(true), data: z.object({ items: z.array(z.object({ id: z.string(), title: z.string(), projectId: z.string() })), nextOffset: z.number().nullable() }) })
const grant = z.object({ id: z.string(), targetGroupId: z.string(), status: z.enum(['offered', 'active', 'revoked', 'removed']), revision: z.number(), versionNumber: z.number(), expiresAt: z.string() })
const grantsSchema = z.object({ success: z.literal(true), data: z.object({ items: z.array(grant), nextOffset: z.number().nullable() }) })
type Props = { artifactId: string; versionId?: string; versions: Array<{ versionId?: string | null; versionNumber?: number }>; t: ReturnType<typeof messages> }

export function GroupGrantPanel({ artifactId, versionId, versions, t }: Props) {
  const [targets, setTargets] = React.useState<z.infer<typeof targetsSchema>['data']['items']>([]), [grants, setGrants] = React.useState<z.infer<typeof grant>[]>([])
  const [target, setTarget] = React.useState(''), [selected, setSelected] = React.useState(versionId ?? ''), [days, setDays] = React.useState('7')
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(false), [sent, setSent] = React.useState(false)
  const [revoke, setRevoke] = React.useState<z.infer<typeof grant> | null>(null)
  const [targetOffset, setTargetOffset] = React.useState<number | null>(0), [grantOffset, setGrantOffset] = React.useState<number | null>(0)
  const generation = React.useRef(0)
  const [analysis, setAnalysis] = React.useState<ResourceAnalysisPolicy>(), [analysisReady, setAnalysisReady] = React.useState(true)
  const changeAnalysis = React.useCallback((policy: ResourceAnalysisPolicy | undefined, ready: boolean) => { setAnalysis(policy); setAnalysisReady(ready) }, [])
  async function load(more = false) {
    const current = ++generation.current, assertScope = captureViewScope()
    setBusy(true); setError(false)
    try {
      const [ts, gs] = await Promise.all([
        more && targetOffset === null ? null : manage('group-grant-targets', { artifactId, offset: more ? targetOffset ?? 0 : 0 }),
        more && grantOffset === null ? null : manage('group-grants', { artifactId, offset: more ? grantOffset ?? 0 : 0 })
      ])
      assertScope(); if (current !== generation.current) return
      if (ts) { const data = targetsSchema.parse(ts).data; setTargets(old => more ? [...old, ...data.items] : data.items); setTargetOffset(data.nextOffset) }
      if (gs) { const data = grantsSchema.parse(gs).data; setGrants(old => more ? [...old, ...data.items] : data.items); setGrantOffset(data.nextOffset) }
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setBusy(false) }
  }
  React.useEffect(() => { void load(); return () => { ++generation.current } }, [artifactId])
  async function submit(removing = false) {
    const current = generation.current, assertScope = captureViewScope()
    setBusy(true); setError(false); setSent(false)
    try {
      z.object({ success: z.literal(true) }).parse(await manage(removing ? 'group-grant-revoke' : 'group-grant-offer', removing && revoke ? { artifactId, grantId: revoke.id, expectedRevision: revoke.revision } : { artifactId, versionId: selected, targetGroupId: target, days: Number(days), ...(analysis ? { analysis } : {}) }))
      assertScope(); if (current !== generation.current) return
      setRevoke(null); setSent(!removing); await load()
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setBusy(false) }
  }
  const status = { offered: t.groupGrantOffered, active: t.groupGrantActive, revoked: t.groupGrantRevoked, removed: t.groupGrantRemoved }
  return <div className="grid gap-4">
    <p className="text-sm text-muted-foreground">{t.groupGrantHint}</p>
    <label className="grid gap-2 text-sm">{t.version}<Select disabled={busy} value={selected} onValueChange={setSelected}><SelectTrigger aria-label={t.version}><SelectValue placeholder={t.publishBeforeShare}/></SelectTrigger><SelectContent>{versions.filter(v => v.versionId).map(v => <SelectItem key={v.versionId} value={v.versionId!}>{t.version} {v.versionNumber}</SelectItem>)}</SelectContent></Select></label>
    <label className="grid gap-2 text-sm">{t.groupGrantTarget}<Select disabled={busy} value={target} onValueChange={setTarget}><SelectTrigger aria-label={t.groupGrantTarget}><SelectValue placeholder={t.groupGrantTarget}/></SelectTrigger><SelectContent>{targets.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent></Select></label>
    {!busy && !error && !targets.length && <p className="text-sm text-muted-foreground">{t.groupGrantNoTargets}</p>}
    {selected && <GroupAnalysisPolicy key={`${artifactId}:${selected}`} artifactId={artifactId} versionId={selected} disabled={busy} t={t} onChange={changeAnalysis}/>}
    {target && grants.some(g => g.targetGroupId === target && ['offered', 'active'].includes(g.status) && Date.parse(g.expiresAt) > Date.now()) && <p className="text-sm text-muted-foreground">{t.analysisReplaceHint}</p>}
    <label className="grid gap-2 text-sm">{t.groupGrantExpiry}<Select disabled={busy} value={days} onValueChange={setDays}><SelectTrigger aria-label={t.groupGrantExpiry}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">{t.groupGrantDay}</SelectItem><SelectItem value="7">{t.groupGrantWeek}</SelectItem><SelectItem value="30">{t.groupGrantMonth}</SelectItem></SelectContent></Select></label>
    {error && <p role="alert" className="text-sm text-destructive">{t.groupGrantError}</p>}
    {sent && <p role="status" className="text-sm">{t.groupGrantSent}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => void load()}>{t.refresh}</Button><Button disabled={busy || !analysisReady || !target || !selected || grants.some(g => g.targetGroupId === target && ['offered', 'active'].includes(g.status) && Date.parse(g.expiresAt) > Date.now())} onClick={() => void submit()}>{busy ? t.loading : t.groupGrantSend}</Button></div>
    <div className="grid max-h-60 gap-3 overflow-y-auto">{grants.map(g => <div key={g.id} className="flex items-center gap-2 border-t pt-3 text-sm"><div className="min-w-0 flex-1"><p className="break-words">{targets.find(x => x.id === g.targetGroupId)?.title ?? t.groupGrantOtherTarget}</p><p className="text-muted-foreground">{t.version} {g.versionNumber} · {status[g.status]}</p></div>{['offered', 'active'].includes(g.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevoke(g)}>{t.groupGrantRevoke}</Button>}</div>)}</div>
    {(targetOffset !== null || grantOffset !== null) && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>{t.groupGrantMore}</Button>}
    <AlertDialog open={!!revoke} onOpenChange={open => { if (!open && !busy) setRevoke(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.groupGrantRevoke}</AlertDialogTitle><AlertDialogDescription>{t.groupGrantRevokeHint}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void submit(true) }}>{t.groupGrantRevoke}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
