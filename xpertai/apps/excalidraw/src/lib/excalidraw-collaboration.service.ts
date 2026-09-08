import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import {
  CollaborationRuntimeCapability,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import * as Y from 'yjs'
import { z } from 'zod/v3'
import { EXCALIDRAW_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { createStableJsonSignature } from './excalidraw-scene.validation.js'
import { excalidrawUnitOfWork } from './excalidraw-unit-of-work.js'
import {
  createExcalidrawYDoc,
  EXCALIDRAW_YJS_SCHEMA_VERSION,
  materializeExcalidrawYDoc,
  writeExcalidrawSceneToYDoc
} from './excalidraw-yjs.js'
import type { ExcalidrawSceneInput, ExcalidrawScope, PatchExcalidrawSceneInput } from './types.js'

import {
  applyElementPatch,
  collaborationSceneSignature,
  collaborationScope,
  normalizeNullableText,
  readElementId,
  scopedCreate,
  drawingStorageScope,
  scopedWhere,
  drawingChildrenScope,
  validateScene
} from './excalidraw-service.utils.js'

import type { ExcalidrawService } from './excalidraw.service.js'
interface CollaborationPorts {
  drawingRepository: Repository<ExcalidrawDrawing>
  versionRepository: Repository<ExcalidrawDrawingVersion>
  runtimeCapabilities?: RuntimeCapabilityRegistry
  requireDrawing: ExcalidrawService['requireDrawing']
  getCurrentVersion: ExcalidrawService['getCurrentVersion']
  markSceneDiverged: ExcalidrawService['markSceneDiverged']
}
export class ExcalidrawCollaborationService {
  constructor(private readonly ports: CollaborationPorts) {}
  private get drawingRepository() {
    return this.ports.drawingRepository
  }
  private get versionRepository() {
    return this.ports.versionRepository
  }
  private get runtimeCapabilities() {
    return this.ports.runtimeCapabilities
  }
  private requireDrawing(scope: ExcalidrawScope, id: string) {
    return this.ports.requireDrawing(scope, id)
  }
  private getCurrentVersion(scope: ExcalidrawScope, drawing: ExcalidrawDrawing) {
    return this.ports.getCurrentVersion(scope, drawing)
  }
  private markSceneDiverged(scope: ExcalidrawScope, id: string, source?: string) {
    return this.ports.markSceneDiverged(scope, id, source)
  }
  async replayOperation(scope: ExcalidrawScope, drawingId: string) {
    const operation = excalidrawUnitOfWork.getStore()
    if (!operation?.operationKey || !this.collaborationOrNull()) return null
    await this.requireDrawing(scope, drawingId)
    const document = await this.collaboration().ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await this.collaboration().getDocumentState({ documentId: document.id }),
      doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, Buffer.from(state.updateBase64, 'base64'))
      const raw = doc.getMap<string>('operationReceipts').get(operation.operationKey)
      if (!raw) return null
      const marker = z
        .object({
          inputHash: z.string(),
          kind: z.enum(['patch', 'replace']),
          addedIds: z.array(z.string()),
          updatedIds: z.array(z.string()),
          deletedIds: z.array(z.string())
        })
        .strict()
        .parse(JSON.parse(raw))
      if (marker.inputHash !== operation.inputHash) throw new ConflictException('operation_id_conflict')
      const drawing = await this.requireCanonicalDrawing(scope, drawingId),
        version = await this.getCurrentVersion(scope, drawing)
      return {
        success: true,
        message: 'Recovered previously committed collaboration operation.',
        drawing,
        version,
        patch: {
          addedIds: marker.addedIds,
          updatedIds: marker.updatedIds,
          deletedIds: marker.deletedIds,
          addCount: marker.addedIds.length,
          updateCount: marker.updatedIds.length,
          deleteCount: marker.deletedIds.length
        }
      }
    } finally {
      doc.destroy()
    }
  }
  private recordOperation(
    doc: Y.Doc,
    kind: 'patch' | 'replace',
    patch: { addedIds: string[]; updatedIds: string[]; deletedIds: string[] } = {
      addedIds: [],
      updatedIds: [],
      deletedIds: []
    }
  ) {
    const operation = excalidrawUnitOfWork.getStore()
    if (operation?.operationKey)
      doc.getMap<string>('operationReceipts').set(
        operation.operationKey,
        JSON.stringify({
          inputHash: operation.inputHash,
          kind,
          addedIds: patch.addedIds,
          updatedIds: patch.updatedIds,
          deletedIds: patch.deletedIds
        })
      )
  }

  async createCollaborationSession(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    if (drawing.status === 'archived') throw new BadRequestException('Archived Excalidraw drawings are read-only.')
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION,
      metadata: { kind: drawing.kind ?? 'diagram' }
    })
    const session = await collaboration.createSession({ documentId: document.id, access: 'write' })
    return { ...session, drawingId, revision: document.sequenceNumber }
  }

  async authorizeCollaborationDocument(context: CollaborationProviderContext) {
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(collaborationScope(context), { id: context.resourceId })
    })
    if (!drawing) return false
    return context.operation !== 'write' || drawing.status !== 'archived'
  }

  async initializeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = collaborationScope(context)
    const drawing = await this.requireDrawing(scope, context.resourceId)
    const version = await this.getCurrentVersion(scope, drawing)
    const scene = validateScene(
      {
        elements: version?.elements,
        appState: version?.appState,
        files: version?.files
      },
      'Collaborative Excalidraw scene'
    )
    const doc = createExcalidrawYDoc({
      ...scene,
      mermaidSource: normalizeNullableText(version?.mermaidSource)
    })
    return {
      stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION,
      initialSequence: Math.max(drawing.revision ?? 0, drawing.currentVersionNumber ?? 0),
      metadata: { kind: drawing.kind ?? 'diagram' }
    }
  }

  async materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    const scope = collaborationScope(event)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(event.stateBase64, 'base64'))
    const materialized = materializeExcalidrawYDoc(doc)
    doc.destroy()
    const scene = validateScene(materialized, 'Collaborative Excalidraw scene')
    await this.drawingRepository.manager.transaction(async (manager) => {
      const drawingRepository = manager.getRepository(ExcalidrawDrawing)
      const versionRepository = manager.getRepository(ExcalidrawDrawingVersion)
      const drawing = await drawingRepository.findOne({
        where: scopedWhere(scope, { id: event.resourceId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!drawing)
        throw new NotFoundException('Excalidraw drawing was not found during collaboration materialization.')
      if ((drawing.revision ?? 0) > event.sequenceNumber) return
      let version = drawing.currentVersionId
        ? await versionRepository.findOne({
            where: scopedWhere(drawingChildrenScope(scope), {
              id: drawing.currentVersionId,
              drawingId: event.resourceId
            })
          })
        : null
      if (version && !version.isCheckpoint) {
        version = await versionRepository.save({
          ...version,
          sourceType: 'workbench',
          elements: scene.elements,
          appState: scene.appState,
          files: scene.files,
          mermaidSource: materialized.mermaidSource
        })
      } else {
        const versionNumber = (drawing.currentVersionNumber ?? 0) + 1
        version = await versionRepository.save(
          versionRepository.create({
            ...scopedCreate(drawingStorageScope(scope, drawing)),
            drawingId: event.resourceId,
            versionNumber,
            sourceType: 'workbench',
            elements: scene.elements,
            appState: scene.appState,
            files: scene.files,
            mermaidSource: materialized.mermaidSource,
            changeSummary: 'Initialized collaborative working scene',
            createdById: scope.userId ?? null,
            assistantId: scope.assistantId ?? null,
            conversationId: scope.conversationId ?? null
          })
        )
        drawing.currentVersionId = version.id
        drawing.currentVersionNumber = versionNumber
      }
      drawing.revision = event.sequenceNumber
      drawing.yjsStateBase64 = event.stateBase64
      drawing.yjsStateVectorBase64 = event.stateVectorBase64
      drawing.yjsUpdateCount = (drawing.yjsUpdateCount ?? 0) + (event.updateBase64 ? 1 : 0)
      drawing.lastEditedById = scope.userId ?? null
      drawing.lastEditedAt = new Date()
      await drawingRepository.save(drawing)
    })
    if (event.updateBase64)
      await this.markSceneDiverged(
        scope,
        event.resourceId,
        event.origin?.includes('agent_diagram_ir') ? 'agent_diagram_ir' : undefined
      )
  }

  async applyCollaborativePatch(scope: ExcalidrawScope, drawing: ExcalidrawDrawing, input: PatchExcalidrawSceneInput) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawing.id,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (state.sequenceNumber !== (drawing.revision ?? 0)) throw new ConflictException('scene_revision_conflict')
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, Buffer.from(state.updateBase64, 'base64'))
      const scene = materializeExcalidrawYDoc(doc)
      const patch = applyElementPatch(scene.elements, input)
      const changed = new Set([...patch.addedIds, ...patch.updatedIds])
      const before = Y.encodeStateVector(doc)
      doc.transact(() => {
        const elements = doc.getMap<string>('elements')
        const order = doc.getArray<string>('elementOrder')
        for (const element of patch.elements) {
          const id = readElementId(element)
          if (changed.has(id)) elements.set(id, createStableJsonSignature(element))
        }
        for (const id of patch.deletedIds) elements.delete(id)
        for (let index = order.length - 1; index >= 0; index--)
          if (patch.deletedIds.includes(order.get(index))) order.delete(index, 1)
        order.push(patch.addedIds)
        if (input.appStatePatch)
          doc.getMap('scene').set('appState', createStableJsonSignature({ ...scene.appState, ...input.appStatePatch }))
        if (input.files !== undefined) {
          const files = doc.getMap<string>('files')
          files.clear()
          for (const [id, file] of Object.entries(input.files)) files.set(id, createStableJsonSignature(file))
        }
        if (input.mermaidSource !== undefined) doc.getMap('scene').set('mermaidSource', input.mermaidSource)
        this.recordOperation(doc, 'patch', patch)
      }, 'excalidraw:agent_patch')
      await collaboration.applyUpdate({
        documentId: document.id,
        updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString('base64'),
        origin: 'excalidraw:agent_patch',
        ...(patch.deletedIds.length ? { expectedSequence: state.sequenceNumber } : {}),
        actor: { actorType: 'agent', actorKey: scope.actorId ?? scope.userId ?? scope.assistantId ?? null }
      })
      const canonical = await this.requireCanonicalDrawing(scope, drawing.id)
      return this.getCurrentVersion(scope, canonical)
    } finally {
      doc.destroy()
    }
  }

  async replaceCollaborativeScene(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput,
    origin: string
  ) {
    const drawingId = drawing.id as string
    const scene = validateScene(input, 'Collaborative Excalidraw scene replacement')
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (state.sequenceNumber !== (drawing.revision ?? 0)) throw new ConflictException('scene_revision_conflict')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, 'base64'))
    const current = materializeExcalidrawYDoc(doc)
    const next = {
      ...scene,
      mermaidSource: normalizeNullableText(input.mermaidSource)
    }
    if (collaborationSceneSignature(current) !== collaborationSceneSignature(next)) {
      const before = Y.encodeStateVector(doc)
      doc.transact(() => {
        writeExcalidrawSceneToYDoc(doc, next, origin)
        this.recordOperation(doc, 'replace')
      }, origin)
      const update = Y.encodeStateAsUpdate(doc, before)
      await collaboration.applyUpdate({
        documentId: document.id,
        updateBase64: Buffer.from(update).toString('base64'),
        origin,
        expectedSequence: state.sequenceNumber,
        actor: {
          actorType: origin.includes('agent') ? 'agent' : 'user',
          actorKey: scope.assistantId ?? scope.userId ?? null,
          displayName: scope.assistantId ? 'Excalidraw Agent' : null
        }
      })
    }
    await this.markSceneDiverged(scope, drawingId, origin.includes('agent_diagram_ir') ? 'agent_diagram_ir' : undefined)
    const canonical = await this.requireCanonicalDrawing(scope, drawingId)
    const version = await this.getCurrentVersion(scope, canonical)
    if (!version) throw new NotFoundException('Collaborative Excalidraw working scene was not materialized.')
    Object.assign(drawing, canonical)
    doc.destroy()
    return version
  }

  async requireCanonicalDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const collaboration = this.collaborationOrNull()
    if (!collaboration) return drawing
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (drawing.revision !== state.sequenceNumber || drawing.yjsStateVectorBase64 !== state.stateVectorBase64) {
      await this.materializeCollaborationDocument({
        ...scope,
        xpertId: scope.assistantId ?? null,
        providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
        resourceId: drawingId,
        operation: 'materialize',
        documentId: document.id,
        stateBase64: state.updateBase64,
        stateVectorBase64: state.stateVectorBase64,
        sequenceNumber: state.sequenceNumber,
        origin: 'excalidraw:canonical-read'
      })
    }
    return this.requireDrawing(scope, drawingId)
  }

  private collaborationOrNull() {
    return this.runtimeCapabilities?.get(CollaborationRuntimeCapability) ?? null
  }

  private collaboration() {
    const capability = this.collaborationOrNull()
    if (!capability) throw new Error('Platform collaboration capability is not available.')
    return capability
  }
}
