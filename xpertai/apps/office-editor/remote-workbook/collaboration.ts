import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { z } from 'zod/v3'
import { createOperationCollaborationClient, createSocketIoTransportAdapter,
  type ICollaborationPresence } from '@xpert-ai/plugin-sdk/collaboration-client'
import { action } from '../remote-file/bridge'
import type { WorkbookSelection } from '../src/lib/workbooks/selection'

const sessionSchema = z.object({ engine: z.literal('operations'), sessionId: z.string().min(1), clientKey: z.string().min(1),
  documentId: z.string().uuid(), namespace: z.literal('/api/collaboration'), connectionUrl: z.string().url(),
  access: z.enum(['read', 'write']), expiresAt: z.number().int().positive(), actor: z.object({ presenceId: z.string(),
    actorType: z.enum(['user', 'agent', 'system']), displayName: z.string(), color: z.string(), avatarUrl: z.string().nullable().optional() }) })

/** Session credentials are memory-only and renewed through the authorized View action.
 * A resource/scope remount disposes the socket, timers and all remote selections. */
export function useWorkbookCollaboration(documentId: string, readSelection: () => (WorkbookSelection & { baseRevision: number }) | null) {
  const selection = useRef(readSelection); selection.current = readSelection
  const [revision, setRevision] = useState(0), [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [peers, setPeers] = useState<ICollaborationPresence[]>([])
  useEffect(() => {
    let active = true, cleanup = () => {}, timer: ReturnType<typeof setTimeout> | undefined
    async function connect() {
      cleanup(); if (!active) return
      setConnection('connecting')
      try {
        const session = sessionSchema.parse(await action('workbook.session', { documentId }))
        if (!active) return
        const socket = io(session.connectionUrl, { transports: ['websocket'], autoConnect: false, reconnection: true,
          reconnectionDelay: 500, reconnectionDelayMax: 5000, auth: { sessionId: session.sessionId, clientKey: session.clientKey, documentId: session.documentId } })
        const client = createOperationCollaborationClient({ session, transport: createSocketIoTransportAdapter(socket),
          onRevision: value => { if (active) setRevision(previous => Math.max(previous, value)) },
          onConnection: value => { if (active) setConnection(value) },
          onPresence: (items, self) => { if (active) setPeers(items.filter(item => item.clientId !== self)) },
          onError: () => { if (active) setConnection('disconnected') } })
        let signature = ''
        const selectionTimer = setInterval(() => {
          const cells = selection.current(), next = JSON.stringify(cells)
          if (signature === next) return
          signature = next
          client.setPresence({ selection: cells ? { kind: 'cells', cells } : null, status: 'editing' })
        }, 250)
        cleanup = () => { clearInterval(selectionTimer); client.disconnect() }
        timer = setTimeout(() => void connect(), Math.max(1000, session.expiresAt - Date.now() - 30000))
        client.connect()
      } catch {
        if (active) { setConnection('disconnected'); setPeers([]); timer = setTimeout(() => void connect(), 10000) }
      }
    }
    void connect()
    return () => { active = false; clearTimeout(timer); cleanup() }
  }, [documentId])
  return { revision, connection, peers }
}
