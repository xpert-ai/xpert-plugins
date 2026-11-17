import { createCanvasYDoc, decodeCanvasYDoc, encodeCanvasYDoc, materializeCanvasYDoc, CANVAS_YJS_OPERATIONS_MAP } from './canvas-yjs.js'
import type { CanvasJsonObject } from './types.js'
import { sanitizeCanvasSnapshot } from './canvas-snapshot.validation.js'
import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { CANVAS_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { CanvasService } from './canvas.service.js'

@Injectable()
@CollaborationDocumentProvider(CANVAS_COLLABORATION_PROVIDER_KEY)
/** Bridges a CanvasDocument projection to the platform-owned Yjs collaboration document. */
export class CanvasCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: CanvasService) {}

  authorize(context: CollaborationProviderContext) {
    return this.service.authorizeCollaborationDocument(context)
  }

  validateDocument(context: CollaborationProviderContext & { stateBase64: string; schemaVersion?: number }) {
    const doc = decodeCanvasYDoc(context.stateBase64)
    try {
      if (context.schemaVersion !== undefined && doc.getMap('canvas').get('schemaVersion') !== context.schemaVersion)
        throw new Error('CANVAS_SCHEMA_MISMATCH')
      const result = sanitizeCanvasSnapshot(materializeCanvasYDoc(doc))
      if (!result.snapshot || result.skippedRecords.length) throw new Error('CANVAS_RECORD_SCHEMA_INVALID')
    } finally { doc.destroy() }
  }

  migrateDocument(context: CollaborationProviderContext & { stateBase64: string; schemaVersion: number; targetSchemaVersion: number }) {
    if (context.schemaVersion !== 1 || context.targetSchemaVersion !== 2) throw new Error('CANVAS_SCHEMA_MIGRATION_UNSUPPORTED')
    const legacy = decodeCanvasYDoc(context.stateBase64)
    try {
      if (legacy.getMap('canvas').get('schemaVersion') !== 1) throw new Error('CANVAS_SCHEMA_MISMATCH')
      const upgraded = createCanvasYDoc(materializeCanvasYDoc(legacy))
      try {
        const operations = upgraded.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP)
        for (const [id, marker] of legacy.getMap<CanvasJsonObject>(CANVAS_YJS_OPERATIONS_MAP)) operations.set(id, marker)
        return { ...encodeCanvasYDoc(upgraded), schemaVersion: 2 }
      } finally { upgraded.destroy() }
    } finally { legacy.destroy() }
  }

  initializeDocument(context: CollaborationProviderContext) {
    return this.service.initializeCollaborationDocument(context)
  }

  materializeDocument(event: CollaborationMaterializationEvent) {
    return this.service.materializeCollaborationDocument(event)
  }
}

export { CANVAS_COLLABORATION_PROVIDER_KEY } from './constants.js'
