import { t, i18n, useMessage } from './i18n'
import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { io } from 'socket.io-client'
import { z } from 'zod/v3'
import { createCollaborationClient, createCollaborationPresenceStore, createSocketIoTransportAdapter,
  base64ToBytes, bytesToBase64, type CollaborationPresenceStoreSnapshot } from '@xpert-ai/plugin-sdk/collaboration-client'
import { action, command, onEditorEvent, closePrepared } from './bridge'
import { platformAwareness } from './presence'
import { stateSchema, sessionSchema, type DocumentState } from './protocol'
import { SCHEMA_VERSION } from '../src/schema'

export function useDocument(resourceId: string) {
  const [doc] = useState(() => new Y.Doc()), [awareness] = useState(() => new Awareness(doc))
  const [state, setState] = useState<DocumentState>(), [connection, setConnection] = useState('connecting')
  const [dirty, setDirty] = useState(false), [error, setError] = useMessage('')
  const [presence, setPresence] = useState<CollaborationPresenceStoreSnapshot>()
  const [self, setSelf] = useState({ name: '', color: '#6366f1' })
  const [restart, setRestart] = useState(0)
  const flushRef = useRef<() => Promise<boolean>>(async () => false)
  // Read the latest resource title without restarting the collaboration session on rename.
  const titleRef = useRef<string>()
  const dirtyRef = useRef(false)
  useEffect(() => {
    titleRef.current = state?.document.title
    if (state) void command('workbench.content.status', {
      resourceId, dirty: dirtyRef.current, title: state.document.title
    }).catch(() => undefined)
  }, [resourceId, state?.document.title])
  useEffect(() => onEditorEvent((event) => {
    if (event.resourceId === resourceId && event.kind === 'prepareClose')
      void flushRef.current().then((ready) => closePrepared(event.requestId, ready))
  }), [resourceId])
  useEffect(() => () => { awareness.destroy(); doc.destroy() }, [doc, awareness])
  useEffect(() => {
    let disposed = false, connecting = false, epoch = 0, canWrite = false
    let pending: Uint8Array[] = [], inFlight: Promise<boolean> | undefined
    let stop: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined, renewal: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const refreshPublishedState = async (attempt = 0) => {
      try {
        const value = stateSchema.parse(await action('document.read', { resourceId }))
        if (disposed) return
        setState(value)
        if (value.document.status === 'pending' && attempt < 20)
          refreshTimer = setTimeout(() => void refreshPublishedState(attempt + 1), 750)
      } catch { /* A disconnect keeps the last confirmed file status visible. */ }
    }
    const status = (value: boolean, label: string) => {
      if (disposed) return
      dirtyRef.current = value
      setDirty(value)
      // Report synchronously with the edit so closing before React renders still waits for save.
      void command('workbench.content.status', { resourceId, dirty: value, title: titleRef.current, label }).catch(() => undefined)
    }
    const flush = async (): Promise<boolean> => {
      if (inFlight) return (await inFlight) && flush()
      if (!pending.length) return true
      if (!canWrite) return false
      const batch = pending.splice(0)
      inFlight = action('document.update', { resourceId, epoch, schemaVersion: SCHEMA_VERSION,
        updateBase64: bytesToBase64(Y.mergeUpdates(batch)) }).then(async (result) => {
          const ack = z.object({ materializationStatus: z.string() }).parse(result)
          if (ack.materializationStatus !== 'ready') throw i18n.error('editor.writePending')
          const current = stateSchema.parse(await action('document.read', { resourceId }))
          if (!disposed) { setState(current); setError(''); status(pending.length > 0, t('editor.saved')) }
          return true
        }).catch((err: unknown) => {
          pending.unshift(...batch)
          if (!disposed) { setError(err instanceof Error ? err : i18n.message('editor.saveFailed')); status(true, t('editor.unsaved')) }
          return false
        }).finally(() => { inFlight = undefined })
      return (await inFlight) && (!pending.length || flush())
    }
    flushRef.current = flush
    const connect = async () => {
      if (disposed || connecting) return
      connecting = true
      try {
        const response = stateSchema.extend({ session: sessionSchema }).parse(await action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }))
        if (disposed) return
        if (epoch && epoch !== response.document.epoch) {
          canWrite = false
          throw i18n.error('editor.epochChanged')
        }
        stop?.(); clearTimeout(renewal)
        epoch = response.document.epoch; canWrite = response.session.access === 'write'
        Y.applyUpdate(doc, base64ToBytes(response.stateBase64), 'initial')
        setState(response); setSelf({ name: response.session.actor.displayName, color: response.session.actor.color })
        const socket = io(response.session.connectionUrl, { autoConnect: false, transports: ['websocket'],
          auth: { sessionId: response.session.sessionId, clientKey: response.session.clientKey, documentId: response.session.documentId } })
        let cursor: ReturnType<typeof platformAwareness> | undefined
        const store = createCollaborationPresenceStore({ selfActor: response.session.actor,
          onChange: (snapshot) => { if (!disposed) { setPresence(snapshot); cursor?.sync(snapshot) } } })
        const client = createCollaborationClient({ session: response.session, transport: createSocketIoTransportAdapter(socket),
          document: { applyUpdate: (update, origin) => {
              Y.applyUpdate(doc, update, origin)
              clearTimeout(refreshTimer)
              refreshTimer = setTimeout(() => void refreshPublishedState(), 400)
            },
            encodeStateVector: () => Y.encodeStateVector(doc), mergeUpdates: Y.mergeUpdates, onUpdate: () => () => {} },
          onConnectionChange: (value) => { if (!disposed) setConnection(value) },
          onPresence: store.upsert, onPresenceSnapshot: (items, metadata) => store.replace(items, metadata.selfClientId),
          onPresenceRemove: store.remove, onError: (err) => { if (!disposed) setError(err) },
          initialPresence: { mode: canWrite ? 'edit' : 'read', focus: { kind: 'document', fieldKey: 'body' } } })
        cursor = platformAwareness(awareness, client)
        const observe = (update: Uint8Array, origin: unknown) => {
          if (origin === client.remoteOrigin || origin === 'initial') return
          pending.push(update); status(true, t('editor.saving')); clearTimeout(timer)
          timer = setTimeout(() => void flush(), 350)
        }
        doc.on('update', observe)
        socket.on('connect_error', () => { if (!disposed) setConnection('disconnected') })
        socket.on('disconnect', (reason) => { if (!disposed && reason === 'io server disconnect') {
          clearTimeout(renewal); renewal = setTimeout(() => void connect(), 1000)
        } })
        client.connect()
        renewal = setTimeout(() => void connect(), Math.max(1000, response.session.expiresAt - Date.now() - 60000))
        stop = () => { doc.off('update', observe); cursor?.destroy(); client.disconnect(); store.clear() }
      } catch (err) {
        if (!disposed) { setError(err instanceof Error ? err : i18n.message('editor.connectionFailed')); setConnection('disconnected') }
        if (!disposed && canWrite) { clearTimeout(renewal); renewal = setTimeout(() => void connect(), 5000) }
      } finally { connecting = false }
    }
    void connect()
    const retry = setInterval(() => { if (pending.length) void flush() }, 5000)
    const guard = (event: BeforeUnloadEvent) => { if (pending.length || inFlight) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', guard)
    return () => { disposed = true; clearTimeout(timer); clearTimeout(renewal); clearTimeout(refreshTimer); clearInterval(retry);
      window.removeEventListener('beforeunload', guard); stop?.() }
  }, [resourceId, doc, awareness, restart])
  // Never recreate a live hook with pending changes. Retry submits the exact buffered delta.
  return { doc, awareness, state, connection, dirty, error, presence, self,
    flush: () => flushRef.current(), retry: () => { if (dirty) void flushRef.current(); else setRestart((n) => n + 1) } }
}
