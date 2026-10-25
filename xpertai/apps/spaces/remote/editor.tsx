import { t, useLocale, i18n } from './i18n'
import { Button, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { io } from 'socket.io-client'
import { z } from 'zod/v3'
import { action } from './bridge'
import { FileConflictDialog } from './file-conflict'

const blockSchema = z.object({ id: z.string(), kind: z.enum(['paragraph', 'heading', 'code', 'bullet']), text: z.string() })
const sessionSchema = z.object({ state: z.string(), sequence: z.number(), externalChange: z.boolean().default(false), canResolve: z.boolean().default(false), session: z.object({
  actor: z.object({ presenceId: z.string(), displayName: z.string() }), sessionId: z.string(), clientKey: z.string(), documentId: z.string(), connectionUrl: z.string(), access: z.enum(['read', 'write'])
}) })
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
const toBase64 = (bytes: Uint8Array) => {
  let output = ''; for (const byte of bytes) output += String.fromCharCode(byte); return btoa(output)
}
export type Selection = { itemId: string; blockId: string; sequence: number; text: string }
export function PageEditor({ itemId, onSelect, onSaved, onReload, onStatus }: { itemId: string; onSelect: (selection: Selection | null) => void; onSaved: (saved: boolean) => void; onReload: () => void; onStatus: (status: string) => void }) {
  useLocale()
  const [doc] = useState(() => new Y.Doc())
  const [blocks, setBlocks] = useState<z.infer<typeof blockSchema>[]>([])
  const [status, setStatusValue] = useState(t('editor.connecting'))
  const setStatus = (value: string) => { setStatusValue(value); onStatus(value) }
  const [people, setPeople] = useState<Array<{ presenceId: string; displayName: string }>>([])
  const [editable, setEditable] = useState(false)
  const [conflict, setConflict] = useState(false), [resolving, setResolving] = useState(false)
  const sequence = useRef(0), writable = useRef(false), selected = useRef<string | null>(null)
  const callbacks = useRef({ onSelect, onSaved }); callbacks.current = { onSelect, onSaved }
  const blocksArray = () => doc.getArray<Y.Map<string | Y.Text>>('blocks')
  useEffect(() => {
    let disposed = false, socket: ReturnType<typeof io> | undefined
    let queue = Promise.resolve(), dirty = 0, failed = false
    let timer: ReturnType<typeof setInterval> | undefined
    const refresh = () => {
      const result = z.array(blockSchema).safeParse(blocksArray().toJSON())
      if (result.success) {
        setBlocks(result.data)
        const block = result.data.find((entry) => entry.id === selected.current)
        callbacks.current.onSelect(block ? { itemId, blockId: block.id, text: block.text, sequence: sequence.current } : null)
      }
    }
    const changed = (_update: Uint8Array, origin: unknown) => {
      refresh()
      if (origin === 'remote' || !writable.current || disposed) return
      dirty++; callbacks.current.onSaved(false); setStatus(t('editor.saving'))
      const bytes = toBase64(Y.encodeStateAsUpdate(doc))
      queue = queue.then(async () => {
        try {
          const ack = z.object({ sequenceNumber: z.number(), materializationStatus: z.string() }).parse(await action('page.update', { itemId, updateBase64: bytes }))
          sequence.current = Math.max(sequence.current, ack.sequenceNumber)
          if (ack.materializationStatus !== 'ready') throw i18n.error('editor.fileSyncFailed')
        } catch (error) {
          failed = true; writable.current = false; setEditable(false)
          setConflict(true)
          setStatus(error instanceof Error ? error.message : t('editor.saveFailed'))
        } finally {
          dirty--
          if (disposed) return
          if (!dirty && !failed) { callbacks.current.onSaved(true); setStatus(t('editor.saved')); refresh() }
        }
      })
    }
    const offline = () => {
      writable.current = false; setEditable(false); socket?.disconnect()
      setStatus(t('editor.offline'))
      callbacks.current.onSaved(dirty === 0 && !failed)
    }
    const online = () => { if (!disposed && !failed) socket?.connect() }
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    doc.on('update', changed)
    void action('page.session', { itemId }).then((raw) => {
      if (disposed) return
      const response = sessionSchema.parse(raw)
      sequence.current = response.sequence
      Y.applyUpdate(doc, fromBase64(response.state), 'remote')
      writable.current = response.session.access === 'write'; setEditable(writable.current)
      callbacks.current.onSaved(true); setStatus(writable.current ? t('editor.saved') : t('editor.readOnly'))
      if (response.externalChange) { setConflict(response.canResolve); setStatus(t('editor.externalChange')) }
      socket = io(response.session.connectionUrl, { transports: ['websocket'], auth: {
        sessionId: response.session.sessionId, clientKey: response.session.clientKey, documentId: response.session.documentId
      } })
      const accept = (raw: unknown) => {
        const packet = z.object({ updateBase64: z.string(), sequenceNumber: z.number() }).safeParse(raw)
        if (!packet.success || disposed) return
        sequence.current = Math.max(sequence.current, packet.data.sequenceNumber)
        Y.applyUpdate(doc, fromBase64(packet.data.updateBase64), 'remote'); refresh()
      }
      socket.on('sync', (packet) => { accept(packet); if (!failed) { writable.current = response.session.access === 'write'; setEditable(writable.current); setStatus(response.externalChange ? t('editor.reviewChanges') : dirty ? t('editor.saving') : writable.current ? t('editor.saved') : t('editor.readOnly')) } }); socket.on('update', accept)
      const presenceSchema = z.object({ clientId: z.string(), presenceId: z.string(), displayName: z.string(), updatedAt: z.number() })
      const sessions = new Map<string, z.infer<typeof presenceSchema>>()
      const renderPeople = () => {
        const now = Date.now(), unique = new Map([[response.session.actor.presenceId, response.session.actor]])
        for (const [id, entry] of sessions) { if (now - entry.updatedAt > 15000) sessions.delete(id); else unique.set(entry.presenceId, entry) }
        setPeople([...unique.values()])
      }
      const upsert = (raw: unknown) => { const entry = presenceSchema.safeParse(raw); if (entry.success) { sessions.set(entry.data.clientId, entry.data); renderPeople() } }
      socket.on('presence', upsert)
      socket.on('presence-snapshot', (raw: unknown) => { const result = z.object({ items: z.array(presenceSchema) }).safeParse(raw); if (result.success) { sessions.clear(); result.data.items.forEach(upsert); renderPeople() } })
      socket.on('presence-remove', (raw: unknown) => { const result = z.object({ clientId: z.string() }).safeParse(raw); if (result.success) { sessions.delete(result.data.clientId); renderPeople() } })
      renderPeople()
      timer = setInterval(() => {
        if (socket?.connected) { socket.emit('sync-request', { stateVectorBase64: toBase64(Y.encodeStateVector(doc)) }); socket.emit('presence', { mode: writable.current ? 'edit' : 'read', focus: selected.current ? { kind: 'block', elementId: selected.current } : null }) }
        renderPeople()
      }, 3000)
      socket.on('disconnect', () => { writable.current = false; setEditable(false); setStatus(t('editor.reauthorize')); callbacks.current.onSaved(dirty === 0 && !failed) })
      socket.on('error', () => { writable.current = false; setEditable(false); setStatus(t('editor.accessFailed')) })
      if (!navigator.onLine) offline()
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('editor.loadFailed')))
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); disposed = true; writable.current = false; clearInterval(timer); socket?.disconnect(); doc.off('update', changed); callbacks.current.onSelect(null); void queue.finally(() => doc.destroy()) }
  }, [doc, itemId])
  function edit(blockId: string, value: string) {
    if (!editable) return
    const node = blocksArray().toArray().find((block) => block.get('id') === blockId), text = node?.get('text')
    if (!(text instanceof Y.Text)) return
    const before = text.toString()
    let start = 0, end = 0
    while (start < before.length && start < value.length && before[start] === value[start]) start++
    while (end < before.length - start && end < value.length - start && before[before.length - end - 1] === value[value.length - end - 1]) end++
    doc.transact(() => { text.delete(start, before.length - start - end); text.insert(start, value.slice(start, value.length - end)) }, 'editor')
  }
  function add() {
    if (!editable) return
    const node = new Y.Map<string | Y.Text>()
    node.set('id', crypto.randomUUID()); node.set('kind', 'paragraph'); node.set('text', new Y.Text())
    blocksArray().push([node])
  }
  return <section className="editor" aria-label={t('editor.label')}>
    <div className="status" role="status">{status} · {t('editor.people', { count: people.length, names: new Intl.ListFormat(i18n.getLocale()).format(people.map((person) => person.displayName)) })}</div>
    {conflict && <Button variant="outline" onClick={() => setResolving(true)}>{t('editor.reviewVersions')}</Button>}
    {resolving && <FileConflictDialog itemId={itemId} localUpdate={toBase64(Y.encodeStateAsUpdate(doc))}
      localText={blocks.map((block) => `${block.kind === 'heading' ? '## ' : ''}${block.text}`).join('\n\n')}
      onClose={() => setResolving(false)} onResolved={onReload} />}
    {blocks.map((block) => <div className={`block ${block.kind}`} key={block.id}>
      <Select value={block.kind} disabled={!editable} onValueChange={(value) => {
        blocksArray().toArray().find((node) => node.get('id') === block.id)?.set('kind', value)
      }}><SelectTrigger aria-label={t('editor.blockType')}><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="paragraph">{t('block.paragraph')}</SelectItem><SelectItem value="heading">{t('block.heading')}</SelectItem><SelectItem value="bullet">{t('block.list')}</SelectItem><SelectItem value="code">{t('block.code')}</SelectItem></SelectContent></Select>
      <Textarea aria-label={block.kind === 'heading' ? t('editor.headingPlaceholder') : t('editor.paragraphPlaceholder')} readOnly={!editable} value={block.text}
        rows={Math.max(2, Math.min(20, block.text.split('\n').length + 1))} onChange={(event) => edit(block.id, event.target.value)}
        onFocus={() => { selected.current = block.id; callbacks.current.onSelect({ itemId, blockId: block.id, text: block.text, sequence: sequence.current }) }} />
    </div>)}
    {editable && <Button onClick={add}>{t('editor.addParagraph')}</Button>}
  </section>
}
