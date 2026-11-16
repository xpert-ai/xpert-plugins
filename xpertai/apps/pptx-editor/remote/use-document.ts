import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { action, command, fileAction, onEditorEvent, closePrepared } from './bridge'
import { parsePptx, savePptx, PPTX_MIME_TYPE } from '../src/core/pptx-file.utils'
import { cloneDeck } from '../src/core/pptx-editor-model.utils'
import { PptxEditHistory } from '../src/core/pptx-editor-history.utils'
import type { PptxDeck } from '../src/core/pptx-types'
import { t } from './i18n'

const documentSchema = z.object({ revision: z.string(), title: z.string(), canWrite: z.boolean(), contentBase64: z.string(),
  sequence: z.number().int().nonnegative().optional(), collaboration: z.boolean().optional() })
export type Source = { resourceId: string; providerKey: string; filePath?: string }
function decode(content: string) {
  const raw = atob(content), bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}
export function useDocument(source: Source) {
  const [deck, setDeck] = useState<PptxDeck | null>(null)
  const [info, setInfo] = useState<z.infer<typeof documentSchema> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const history = useRef(new PptxEditHistory()), bytes = useRef<ArrayBuffer | null>(null)
  const current = useRef(deck), state = useRef(info), saving = useRef<Promise<void> | null>(null)
  const lifetime = useRef(0), editGroup = useRef<string>(), changed = useRef(false)
  const loading = useRef(false)
  current.current = deck; state.current = info; changed.current = dirty
  const fail = useCallback((failure: unknown) => {
    setError(failure instanceof Error && /conflict|revision/i.test(failure.message) ? 'conflict' : 'failed')
  }, [])
  const load = useCallback(async () => {
    const epoch = ++lifetime.current
    loading.current = true; setBusy(true); setError('')
    try {
      const next = documentSchema.parse(await action('file.read', source))
      const buffer = decode(next.contentBase64), parsed = await parsePptx(buffer)
      if (epoch !== lifetime.current) return
      bytes.current = buffer; current.current = parsed; state.current = next
      setInfo(next); setDeck(parsed); history.current.reset(); editGroup.current = undefined
      changed.current = false; setDirty(false)
    } catch (failure) { if (epoch === lifetime.current) fail(failure) }
    finally { if (epoch === lifetime.current) { loading.current = false; setBusy(false) } }
  }, [source.resourceId, source.providerKey, source.filePath, fail])
  useEffect(() => { void load(); return () => { lifetime.current++ } }, [load])
  const edit = useCallback((apply: (value: PptxDeck) => void, group?: string) => {
    if (!current.current || !state.current?.canWrite || saving.current || loading.current) return
    const next = cloneDeck(current.current); apply(next)
    if (!group || editGroup.current !== group) history.current.push(current.current)
    editGroup.current = group; current.current = next; setDeck(next)
    changed.current = history.current.dirty; setDirty(changed.current)
  }, [])
  const travel = (direction: 'undo' | 'redo') => {
    if (!current.current || saving.current || !state.current?.canWrite) return
    const next = history.current[direction](current.current)
    if (!next) return
    current.current = next; setDeck(next); editGroup.current = undefined
    changed.current = history.current.dirty; setDirty(changed.current)
  }
  const save = useCallback((): Promise<void> => {
    if (saving.current) return saving.current
    if (!changed.current) return Promise.resolve()
    const original = bytes.current, draft = current.current, metadata = state.current
    if (!original || !draft || !metadata?.canWrite) return Promise.reject(new Error('pptx.read_only'))
    const epoch = lifetime.current
    setBusy(true); setError('')
    const job = (async () => {
      const buffer = await savePptx(cloneDeck(draft), original)
      const result = z.object({ revision: z.string(), sequence: z.number().int().nonnegative().optional() }).parse(await fileAction('file.save',
        { ...source, expectedRevision: metadata.revision }, new File([buffer], metadata.title, { type: PPTX_MIME_TYPE })))
      const parsed = await parsePptx(buffer)
      if (epoch !== lifetime.current) return
      bytes.current = buffer; current.current = parsed; setDeck(parsed)
      state.current = { ...metadata, revision: result.revision, sequence: result.sequence }; setInfo(state.current)
      history.current.reset(); editGroup.current = undefined; changed.current = false; setDirty(false)
    })().catch(failure => { if (epoch === lifetime.current) fail(failure); throw failure })
      .finally(() => { saving.current = null; if (epoch === lifetime.current) setBusy(false) })
    saving.current = job
    return job
  }, [source.resourceId, source.providerKey, source.filePath, fail])
  const download = async () => {
    if (!current.current || !bytes.current || !state.current) return
    const buffer = await savePptx(cloneDeck(current.current), bytes.current)
    const url = URL.createObjectURL(new Blob([buffer], { type: PPTX_MIME_TYPE }))
    const link = document.createElement('a'); link.href = url
    link.download = state.current.title.toLowerCase().endsWith('.pptx') ? state.current.title : `${state.current.title}.pptx`
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  useEffect(() => {
    void command('workbench.content.status', { resourceId: source.resourceId, dirty: dirty || busy,
      title: info?.title, label: t(busy ? 'ppt.saving' : dirty ? 'ppt.unsaved' : 'ppt.saved') }).catch(fail)
  }, [source.resourceId, dirty, busy, info?.title, fail])
  useEffect(() => onEditorEvent(event => {
    if (event.kind !== 'prepareClose' || event.resourceId !== source.resourceId) return
    void save().then(() => closePrepared(event.requestId, !changed.current), () => closePrepared(event.requestId, false))
  }), [source.resourceId, save])
  return { deck, info, busy, error, dirty, edit, travel, save, download, load, fail,
    canUndo: history.current.canUndo, canRedo: history.current.canRedo,
    endEdit: () => { editGroup.current = undefined } }
}
