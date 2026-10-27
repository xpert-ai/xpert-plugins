import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Textarea, Label } from '@xpert-ai/plugin-shadcn-ui'
import { action, command, onPrepareClose } from './bridge'
import { i18n } from './i18n'
const filesSchema = z.object({ files: z.array(z.object({ path: z.string(), content: z.string(), encoding: z.enum(['utf8', 'base64']), sha256: z.string() })) })
type SourceFile = z.infer<typeof filesSchema>['files'][number]
export function SourceDialog({ projectId, versionId, locale, onClose, onSaved }: { projectId: string; versionId: string | null; locale?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = i18n(locale)
  const [files, setFiles] = useState<SourceFile[]>([]), [path, setPath] = useState(''), [content, setContent] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [head, setHead] = useState(versionId)
  const current = files.find(file => file.path === path), dirty = !!current && content !== current.content
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty || busy
  const report = (value: boolean) => { void command('workbench.content.status', { resourceId: projectId, dirty: value }).catch(() => undefined) }
  useEffect(() => { report(dirty || busy) }, [projectId, dirty, busy])
  useEffect(() => onPrepareClose(id => id !== projectId || !dirtyRef.current), [projectId])
  useEffect(() => () => report(false), [projectId])
  useEffect(() => { let active = true; void action('source_read', { projectId }).then(result => {
    if (!active) return
    const parsed = filesSchema.parse(result).files
    setFiles(parsed); const first = parsed.find(file => file.encoding === 'utf8'); setPath(first?.path ?? ''); setContent(first?.content ?? '')
  }).catch(() => { if (active) setError('sourceError') }); return () => { active = false } }, [projectId])
  async function save() {
    if (!current) return
    setBusy(true); setError('')
    try {
      const result = z.object({ sha256: z.string() }).parse(await action('source_write', { projectId, path, content, expectedHash: current.sha256 }))
      setFiles(previous => previous.map(file => file.path === path ? { ...file, content, sha256: result.sha256 } : file))
    } catch { setError('sourceConflict') } finally { setBusy(false) }
  }
  async function snapshot() {
    setBusy(true); setError('')
    try { const result = z.object({ id: z.string() }).parse(await action('source_version', { projectId, expectedVersionId: head })); setHead(result.id); onSaved() }
    catch { setError('sourceConflict') } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !dirty && !busy) onClose() }}><DialogContent className="max-w-4xl">
    <DialogHeader><DialogTitle>{t('source')}</DialogTitle><DialogDescription>{t('sourceDescription')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{t(error === 'sourceConflict' ? 'sourceConflict' : 'sourceError')}</p>}
    <Label>{t('sourceFile')}<Select value={path || 'none'} disabled={dirty || busy} onValueChange={value => { setPath(value); setContent(files.find(file => file.path === value)?.content ?? '') }}>
      <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{files.filter(file => file.encoding === 'utf8').map(file => <SelectItem key={file.path} value={file.path}>{file.path}</SelectItem>)}</SelectContent>
    </Select></Label>
    <Textarea aria-label={t('sourceFile')} className="min-h-80 font-mono" value={content} disabled={!current || busy} onChange={event => { dirtyRef.current = true; report(true); setContent(event.target.value) }} />
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{t(dirty ? 'sourceDiscard' : 'cancel')}</Button><Button variant="outline" disabled={dirty || busy || !current} onClick={() => void snapshot()}>{t('sourceVersion')}</Button><Button disabled={!dirty || busy} onClick={() => void save()}>{t('sourceSave')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
