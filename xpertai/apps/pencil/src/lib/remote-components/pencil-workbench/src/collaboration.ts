import {
  createCollaborationClient,
  createCollaborationPresenceStore,
  createSocketIoTransportAdapter,
  createYjsDocumentAdapter,
  type CollaborationClient,
  type CollaborationPresencePatch,
  type CollaborationPresenceStoreSnapshot,
  type CollaborationSessionDescriptor
} from '@xpert-ai/plugin-sdk/collaboration-client'
import type { ICollaborationPresence } from '@xpert-ai/contracts'
import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import {
  materializePencilCollaborationDoc,
  replacePencilCollaborationState,
  type PencilCollaborativeDocument
} from '../../../pencil-collaboration.js'
import type { PencilGraphSnapshot, PencilJsonObject, PencilJsonValue } from '../../../types.js'
import type { RemotePayloadObject, RemotePayloadValue } from './runtime.js'
import type { GraphSnapshot } from './types.js'

export const PENCIL_LOCAL_COLLABORATION_ORIGIN = Object.freeze({ kind: 'pencil.collaboration.local' })

export type PencilPresence = ICollaborationPresence

export type PencilPresencePatch = CollaborationPresencePatch

export type PencilCollaborationSessionDescriptor = CollaborationSessionDescriptor

export type PencilCollaborationConnectionState = 'connecting' | 'connected' | 'disconnected'

export type PencilPresenceView = CollaborationPresenceStoreSnapshot

export type PencilWorkbenchCollaborationOptions = {
  session: PencilCollaborationSessionDescriptor
  initialDocument: PencilCollaborativeDocument
  snapshot: () => GraphSnapshot
  applyRemoteSnapshot: (snapshot: GraphSnapshot, document: PencilCollaborativeDocument) => void | Promise<void>
  captureTextSelection?: () => { nodeId: string; cursor: number; selectionAnchor: number | null } | null
  restoreTextSelection?: (selection: { nodeId: string; cursor: number; selectionAnchor: number | null }) => void
  onPresence: (view: PencilPresenceView) => void
  onConnectionChange: (state: PencilCollaborationConnectionState) => void
  onSequence: (sequence: number) => void
  onError: (error: Error) => void
}

export type PencilWorkbenchCollaboration = {
  readonly doc: Y.Doc
  readonly undoManager: Y.UndoManager
  syncLocalGraph(): void
  setDocumentMetadata(patch: Partial<PencilCollaborativeDocument>): void
  setPresence(patch: PencilPresencePatch): void
  flush(): void
  undo(): void
  redo(): void
  destroy(): void
}

/** Bind a Pencil graph adapter to the generic platform Collaboration client. */
export function createPencilWorkbenchCollaboration(options: PencilWorkbenchCollaborationOptions): PencilWorkbenchCollaboration {
  const doc = new Y.Doc()
  const trackedTypes = [
    doc.getMap('document'),
    doc.getMap('meta'),
    doc.getMap('nodes'),
    doc.getMap('texts'),
    doc.getMap('children'),
    doc.getMap('imageMeta'),
    doc.getMap('imageChunks'),
    doc.getMap('variables'),
    doc.getMap('variableCollections'),
    doc.getMap('activeMode'),
    doc.getMap('instanceIndex')
  ]
  const undoManager = new Y.UndoManager(trackedTypes, {
    trackedOrigins: new Set([PENCIL_LOCAL_COLLABORATION_ORIGIN]),
    captureTimeout: 500
  })
  const socket: Socket = io(options.session.connectionUrl, {
    autoConnect: false,
    transports: ['websocket'],
    auth: {
      sessionId: options.session.sessionId,
      clientKey: options.session.clientKey,
      documentId: options.session.documentId
    }
  })
  let documentMetadata = { ...options.initialDocument }
  let applyingRemote = false
  let relativeSelection: {
    nodeId: string
    cursor: Y.RelativePosition
    selectionAnchor: Y.RelativePosition | null
  } | null = null
  let client: CollaborationClient

  const presenceStore = createCollaborationPresenceStore({
    selfActor: options.session.actor,
    includeSelf: true,
    onChange: options.onPresence
  })
  const applyRemoteDocument = async () => {
    if (applyingRemote) return
    applyingRemote = true
    try {
      const materialized = materializePencilCollaborationDoc(doc)
      documentMetadata = materialized.document
      await options.applyRemoteSnapshot(materialized.graphSnapshot as GraphSnapshot, materialized.document)
      if (relativeSelection && options.restoreTextSelection) {
        const cursor = Y.createAbsolutePositionFromRelativePosition(relativeSelection.cursor, doc)
        const anchor = relativeSelection.selectionAnchor
          ? Y.createAbsolutePositionFromRelativePosition(relativeSelection.selectionAnchor, doc)
          : null
        options.restoreTextSelection({
          nodeId: relativeSelection.nodeId,
          cursor: cursor?.index ?? 0,
          selectionAnchor: anchor?.index ?? null
        })
      }
    } catch (error) {
      options.onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      applyingRemote = false
    }
  }

  doc.on('update', (_update, origin) => {
    if (origin === PENCIL_LOCAL_COLLABORATION_ORIGIN || origin === undoManager) return
    void applyRemoteDocument()
  })
  doc.on('beforeTransaction', (transaction) => {
    if (transaction.origin === PENCIL_LOCAL_COLLABORATION_ORIGIN || transaction.origin === undoManager) return
    const selection = options.captureTextSelection?.()
    const text = selection ? doc.getMap<Y.Text>('texts').get(selection.nodeId) : null
    relativeSelection = selection && text
      ? {
          nodeId: selection.nodeId,
          cursor: Y.createRelativePositionFromTypeIndex(text, selection.cursor),
          selectionAnchor: selection.selectionAnchor == null
            ? null
            : Y.createRelativePositionFromTypeIndex(text, selection.selectionAnchor)
        }
      : null
  })

  client = createCollaborationClient({
    session: options.session,
    transport: createSocketIoTransportAdapter(socket),
    document: createYjsDocumentAdapter(doc, {
      applyUpdate: (document, update, origin) => Y.applyUpdate(document, update, origin),
      encodeStateVector: (document) => Y.encodeStateVector(document),
      mergeUpdates: (updates) => Y.mergeUpdates(updates)
    }),
    initialPresence: { mode: 'edit' },
    batchMs: 40,
    syncIntervalMs: 2_000,
    presenceHeartbeatMs: 5_000,
    onAck: (ack) => options.onSequence(ack.sequenceNumber),
    onPresence: (presence) => presenceStore.upsert(presence),
    onPresenceSnapshot: (items, metadata) =>
      presenceStore.replace(items, metadata.selfClientId),
    onPresenceRemove: (clientId) => presenceStore.remove(clientId),
    onConnectionChange: options.onConnectionChange,
    onError: options.onError
  })
  client.connect()

  const syncLocalGraph = () => {
    if (applyingRemote) return
    replacePencilCollaborationState(doc, toPencilGraphSnapshot(options.snapshot()), documentMetadata, PENCIL_LOCAL_COLLABORATION_ORIGIN)
  }

  return {
    doc,
    undoManager,
    syncLocalGraph,
    setDocumentMetadata(patch) {
      documentMetadata = { ...documentMetadata, ...patch }
      syncLocalGraph()
    },
    setPresence: (patch) => client.setPresence(patch),
    flush: () => client.flush(),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    destroy() {
      client.disconnect()
      socket.removeAllListeners()
      undoManager.destroy()
      doc.destroy()
      presenceStore.clear()
    }
  }
}

function toPencilGraphSnapshot(snapshot: GraphSnapshot): PencilGraphSnapshot {
  return {
    ...snapshot,
    nodes: snapshot.nodes.map(([id, value]) => [id, toPencilJsonObject(value)]),
    variables: snapshot.variables.map(([id, value]) => [id, toPencilJsonObject(value)]),
    variableCollections: snapshot.variableCollections.map(([id, value]) => [id, toPencilJsonObject(value)])
  }
}

function toPencilJsonObject(value: RemotePayloadObject): PencilJsonObject {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => item === undefined ? [] : [[key, toPencilJsonValue(item)]])
  )
}

function toPencilJsonValue(value: RemotePayloadValue): PencilJsonValue {
  if (value instanceof ArrayBuffer) throw new Error('ArrayBuffer is not valid inside a Pencil graph snapshot.')
  if (Array.isArray(value)) return value.map(toPencilJsonValue)
  if (value && typeof value === 'object') return toPencilJsonObject(value)
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  throw new Error('Unsupported value inside a Pencil graph snapshot.')
}
