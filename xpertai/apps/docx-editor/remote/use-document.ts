import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocxEditorRef } from '@docx-editor.dev/react'
import { z } from 'zod'
import { action, command, fileAction, onEditorEvent, closePrepared } from './bridge'
import { t } from './i18n'
export type Source = { resourceId: string; providerKey: string; filePath?: string }
export const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const metadata = z.object({ title: z.string(), revision: z.string(), canWrite: z.boolean(), contentBase64: z.string(),
  sequence: z.number().optional(), collaboration: z.boolean().optional() })

export function useDocument(source: Source) {
  const editor = useRef<DocxEditorRef>(null)
  const [info, setInfo] = useState<z.infer<typeof metadata> | null>(null)
  const [bytes, setBytes] = useState<Uint8Array>(), [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<'document.conflict' | 'document.failed' | null>(null)
  const state = useRef(info), changes = useRef(0), changed = useRef(false), lifetime = useRef(0)
  const saving = useRef<Promise<void> | null>(null), loading = useRef(false)
  state.current = info
  const fail = useCallback((reason: unknown) => setError(reason instanceof Error && /conflict|revision/i.test(reason.message) ? 'document.conflict' : 'document.failed'), [])
  const load = useCallback(async () => {
    // A refresh or remote notification must never discard an unsaved draft.
    if (changed.current || saving.current) return
    const epoch = ++lifetime.current
    loading.current = true; setBusy(true); setError(null)
    try {
      const next = metadata.parse(await action('file.read', source))
      if (epoch !== lifetime.current) return
      const raw = atob(next.contentBase64)
      setBytes(Uint8Array.from(raw, char => char.charCodeAt(0)))
      state.current = next; setInfo(next); changes.current = 0
    } catch (reason) { if (epoch === lifetime.current) fail(reason) }
    finally { if (epoch === lifetime.current) { loading.current = false; setBusy(false) } }
  }, [source.resourceId, source.providerKey, source.filePath, fail])
  useEffect(() => { void load(); return () => { lifetime.current++ } }, [load])
  const edit = useCallback(() => {
    if (!state.current?.canWrite || loading.current) return
    changes.current++; changed.current = true; setDirty(true)
  }, [])
  const save = useCallback((): Promise<void> => {
    if (saving.current) return saving.current
    if (loading.current) return Promise.reject(new Error('docx.loading'))
    if (!changed.current) return Promise.resolve()
    const current = state.current, version = changes.current, epoch = lifetime.current
    if (!current?.canWrite || !editor.current) return Promise.reject(new Error('docx.read_only'))
    setBusy(true); setError(null)
    const job = (async () => {
      const buffer = await editor.current!.save()
      if (!buffer) throw new Error('docx.empty_export')
      const result = z.object({ revision: z.string(), sequence: z.number().optional() }).parse(await fileAction('file.save',
        { ...source, expectedRevision: current.revision }, new File([buffer], current.title, { type: mimeType })))
      if (epoch !== lifetime.current) return
      state.current = { ...current, ...result }; setInfo(state.current)
      // Typing may continue while the captured bytes are being uploaded.
      changed.current = changes.current !== version; setDirty(changed.current)
    })().catch(reason => { if (epoch === lifetime.current) fail(reason); throw reason })
      .finally(() => { saving.current = null; if (epoch === lifetime.current) setBusy(false) })
    saving.current = job; return job
  }, [source.resourceId, source.providerKey, source.filePath, fail])
  const downloadDraft = async () => {
    try {
      const buffer = await editor.current?.save()
      if (!buffer) throw new Error('docx.not_ready')
      const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }))
      const a = document.createElement('a'); a.href = url; a.download = state.current?.title.endsWith('.docx') ? state.current.title : `${state.current?.title ?? 'document'}.docx`
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (reason) { fail(reason) }
  }
  useEffect(() => {
    void command('workbench.content.status', { resourceId: source.resourceId, dirty: dirty || busy,
      title: info?.title, label: t(busy ? 'document.saving' : dirty ? 'document.unsaved' : 'document.saved') }).catch(fail)
  }, [source.resourceId, dirty, busy, info?.title, fail])
  useEffect(() => onEditorEvent(event => {
    if (event.kind === 'prepareClose' && event.resourceId === source.resourceId)
      void save().then(() => closePrepared(event.requestId, !changed.current && !loading.current), () => closePrepared(event.requestId, false))
  }), [source.resourceId, save])
  return { editor, info, bytes, dirty, busy, error, edit, save, load, downloadDraft, fail }
}
