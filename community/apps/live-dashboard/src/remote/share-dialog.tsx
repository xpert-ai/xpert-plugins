import * as React from 'react'
import { z } from 'zod/v3'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'
import { requestHost } from './bridge'
import { messages } from './i18n'

const stateSchema = z.object({ published: z.object({ versionId: z.string(), versionNumber: z.number(), title: z.string().nullish() }).nullable(),
  issues: z.array(z.object({ code: z.string(), bindingId: z.string().optional() })),
  link: z.object({ status: z.string(), versionMode: z.enum(['latest', 'version']), versionId: z.string().nullish(), url: z.string().url().optional() }).nullable() })
const responseSchema = z.object({ success: z.literal(true), data: stateSchema })
type Props = { artifactId: string; versionId?: string; versions: Array<{ versionId?: string | null; versionNumber?: number }>; t: ReturnType<typeof messages>; onClose(): void }

export function ShareDialog({ artifactId, versionId, versions, t, onClose }: Props) {
  const [state, setState] = React.useState<z.infer<typeof stateSchema> | null>(null)
  const [mode, setMode] = React.useState<'latest' | 'version'>('latest')
  const [selected, setSelected] = React.useState(versionId ?? versions[0]?.versionId ?? '')
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [copied, setCopied] = React.useState(false)
  const linkInput = React.useRef<HTMLInputElement>(null), sequence = React.useRef(0), initialized = React.useRef(false)
  async function request(actionKey: string) {
    const current = ++sequence.current
    setBusy(true); setError(''); setCopied(false)
    try {
      const result = responseSchema.parse(await requestHost('executeAction', { actionKey, input: {
        artifactId, ...(actionKey === 'share' ? { versionMode: mode } : {}),
        ...(actionKey !== 'revoke-share' && mode === 'version' && selected ? { versionId: selected } : {})
      } })).data
      if (current === sequence.current) {
        setState(result)
        if (!initialized.current) {
          initialized.current = true
          if (result.link?.status === 'active') {
            setMode(result.link.versionMode)
            if (result.link.versionId) setSelected(result.link.versionId)
          }
        }
      }
    } catch { if (current === sequence.current) setError(t.error) }
    finally { if (current === sequence.current) setBusy(false) }
  }
  React.useEffect(() => { void request('share-status'); return () => { ++sequence.current } }, [artifactId, mode, selected])
  const link = state?.link?.status === 'active' ? state.link : null
  const matches = link && link.versionMode === mode && (mode === 'latest' || link.versionId === selected)
  const issueText = (code: string) => code === 'DASHBOARD_PUBLISH_BEFORE_SHARING' ? t.publishBeforeShare :
    code === 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' || code === 'DASHBOARD_PRIVATE_DEPENDENCY' ? t.privateDependencies : t.sourceUnavailable
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>{t.share}</DialogTitle><DialogDescription>{t.shareHint}</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2">
        <label className="grid gap-2 text-sm">{t.shareVersion}
          <Select value={mode} disabled={busy} onValueChange={value => setMode(value === 'version' ? 'version' : 'latest')}>
            <SelectTrigger aria-label={t.shareVersion}><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="latest">{t.shareLatest}</SelectItem><SelectItem value="version">{t.shareFixed}</SelectItem></SelectContent>
          </Select>
        </label>
        {mode === 'version' && <Select value={selected} disabled={busy} onValueChange={setSelected}>
          <SelectTrigger aria-label={t.version}><SelectValue placeholder={t.version}/></SelectTrigger><SelectContent>
            {versions.filter(item => item.versionId).map(item => <SelectItem key={item.versionId} value={item.versionId!}>{t.version} {item.versionNumber}</SelectItem>)}
          </SelectContent>
        </Select>}
        {state?.published && <p className="text-sm text-muted-foreground">{state.published.title} · {t.version} {state.published.versionNumber}</p>}
        {!!state?.issues.length && <ul className="grid gap-2 text-sm text-destructive" role="alert">{state.issues.map((issue, index) => <li key={index}>{issueText(issue.code)}{issue.bindingId ? ` (${issue.bindingId})` : ''}</li>)}</ul>}
        <p className="text-xs text-muted-foreground">{t.sharePermissions}</p>
        {link?.url && <div className="grid gap-2"><label htmlFor="dashboard-share-url" className="text-sm">{t.shareLink}</label>
          <Input id="dashboard-share-url" ref={linkInput} readOnly value={link.url} onFocus={event => event.target.select()}/>
          <div className="flex gap-2"><Button variant="outline" onClick={() => {
            linkInput.current?.focus(); linkInput.current?.select()
            // Synchronous user gesture in the sandbox; the URL remains selectable if copying is denied.
            setCopied(document.execCommand('copy'))
          }}>{copied ? t.copied : t.copyLink}</Button>
          <a className="inline-flex items-center px-2 text-sm underline" href={link.url} target="_blank" rel="noopener noreferrer">{t.openShared}</a></div>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        {link && <Button variant="outline" disabled={busy} onClick={() => void request('revoke-share')}>{t.revokeShare}</Button>}
        <Button variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button>
        <Button disabled={busy || !state || !!state.issues.length || !!matches} onClick={() => void request('share')}>{link ? t.updateShare : t.enableShare}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
