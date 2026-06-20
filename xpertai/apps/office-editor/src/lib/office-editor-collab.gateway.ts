import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX } from './constants.js'
import { OfficeEditorService } from './office-editor.service.js'
import type { OfficeCollabSession } from './types.js'

const OFFICE_EDITOR_COLLAB_NAMESPACE = /^\/api\/office-editor\/collab\/ws\/[^/]+$/

@WebSocketGateway({
  namespace: OFFICE_EDITOR_COLLAB_NAMESPACE,
  cors: {
    origin: '*'
  },
  transports: ['websocket']
})
export class OfficeEditorCollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OfficeEditorCollabGateway.name)
  private readonly sessions = new WeakMap<Socket, OfficeCollabSession>()

  constructor(private readonly service: OfficeEditorService) {}

  async handleConnection(client: Socket): Promise<void> {
    const documentId = this.extractDocumentId(client)
    const sessionId = this.extractSessionId(client)
    const session = this.service.resolveCollabSession(sessionId, documentId)
    if (!documentId || !session) {
      client.emit('office-error', { message: 'Invalid Office Editor collaboration session.' })
      client.disconnect(true)
      return
    }

    this.sessions.set(client, session)
    await client.join(this.roomName(session.documentId))
    const state = await this.service.getDocumentForCollab(session)
    client.emit('sync', {
      documentId: session.documentId,
      yjsStateBase64: state.yjsStateBase64,
      snapshot: state.snapshot?.snapshot ?? null
    })
    this.logger.log(`[office-editor-collab] connected documentId=${session.documentId} socket=${client.id}`)
  }

  handleDisconnect(client: Socket): void {
    const session = this.sessions.get(client)
    if (session) {
      client.to(this.roomName(session.documentId)).emit('presence', {
        type: 'leave',
        clientId: client.id
      })
    }
  }

  @SubscribeMessage('yjs-update')
  async handleYjsUpdate(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): Promise<void> {
    const session = this.sessions.get(client)
    if (!session) {
      return
    }
    const payload = toObject(data)
    const updateBase64 = toBase64(payload.updateBase64 ?? payload.update ?? data)
    if (!updateBase64) {
      return
    }
    const result = await this.service.persistCollabUpdate(session, {
      updateBase64,
      origin: toString(payload.origin),
      clientId: toString(payload.clientId) ?? client.id
    })
    client.to(this.roomName(session.documentId)).emit('yjs-update', {
      documentId: session.documentId,
      updateBase64,
      origin: toString(payload.origin),
      clientId: toString(payload.clientId) ?? client.id
    })
    client.emit('yjs-ack', {
      documentId: session.documentId,
      duplicate: result.duplicate,
      updateId: result.update?.id,
      yjsStateVectorBase64: result.yjsStateVectorBase64
    })
  }

  @SubscribeMessage('snapshot')
  async handleSnapshot(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): Promise<void> {
    const session = this.sessions.get(client)
    if (!session) {
      return
    }
    const payload = toObject(data)
    const result = await this.service.persistCollabUpdate(session, {
      fullStateBase64: toString(payload.fullStateBase64),
      stateVectorBase64: toString(payload.stateVectorBase64),
      snapshot: payload.snapshot,
      snapshotText: toString(payload.snapshotText),
      origin: toString(payload.origin),
      clientId: toString(payload.clientId) ?? client.id
    })
    client.to(this.roomName(session.documentId)).emit('snapshot', {
      documentId: session.documentId,
      snapshot: payload.snapshot,
      yjsStateBase64: result.yjsStateBase64,
      yjsStateVectorBase64: result.yjsStateVectorBase64
    })
    client.emit('snapshot-ack', {
      documentId: session.documentId,
      snapshotId: result.snapshot?.id,
      versionNumber: result.snapshot?.versionNumber
    })
  }

  @SubscribeMessage('awareness')
  handleAwareness(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): void {
    const session = this.sessions.get(client)
    if (!session) {
      return
    }
    client.to(this.roomName(session.documentId)).emit('awareness', data)
  }

  private extractDocumentId(client: Socket) {
    const namespaceName = toString(client.nsp?.name)
    if (namespaceName?.startsWith(OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX)) {
      return decodeURIComponent(namespaceName.slice(OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX.length))
    }
    return undefined
  }

  private extractSessionId(client: Socket) {
    const query = client.handshake?.query ?? {}
    const auth = (client.handshake?.auth ?? {}) as Record<string, unknown>
    return toString(auth.sessionId ?? query.sessionId)
  }

  private roomName(documentId: string) {
    return `office-editor:${documentId}`
  }
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toBase64(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64')
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString('base64')
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
  }
  return undefined
}
