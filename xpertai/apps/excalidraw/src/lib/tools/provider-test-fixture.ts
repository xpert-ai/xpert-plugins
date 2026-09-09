import {
  ExcalidrawDrawing,
  ExcalidrawDrawingVersion,
  ExcalidrawActionLog,
  ExcalidrawArtifactPublication
} from '../entities/index.js'
import { ExcalidrawOperation } from '../entities/excalidraw-operation.entity.js'
import { ExcalidrawRenderJob } from '../entities/excalidraw-render-job.entity.js'
import { DiagramIrRevision } from '../diagram-engine/entities/index.js'
import { DataSource } from 'typeorm'
import type { ZodType } from 'zod/v3'
import { ExcalidrawService } from '../excalidraw.service.js'
import { ExcalidrawReadService } from '../excalidraw-read.service.js'
import { ExcalidrawOperationService } from '../excalidraw-operation.service.js'
import { ExcalidrawRenderService } from '../rendering/excalidraw-render.service.js'
import { ExcalidrawTools } from './excalidraw-tools.provider.js'
import { DiagramIrService } from '../diagram-engine/diagram-ir.service.js'
import {
  ArtifactTemplateCatalogService,
  DiagramArtifactTemplateAdapter
} from '../diagram-engine/artifact-template-catalog.service.js'
import {
  DiagramCompilerService,
  DiagramValidationService,
  DiagramPreviewService
} from '../diagram-engine/diagram-rendering.service.js'
import { DiagramLayoutService, DiagramRoutingService } from '../diagram-engine/diagram-layout.service.js'
import type { JsonValue } from './contracts.js'
import type { ExcalidrawScope } from '../types.js'
class ImmediateOperations extends ExcalidrawOperationService {
  override async run<T extends JsonValue>(
    _scope: ExcalidrawScope,
    _name: string,
    _operationId: string,
    _input: JsonValue,
    schema: ZodType<T>,
    action: () => Promise<T>
  ): Promise<T> {
    return schema.parse(await action())
  }
  override async lookup<T extends JsonValue>(
    _scope: ExcalidrawScope,
    _name: string,
    _operationId: string,
    _input: JsonValue,
    _schema: ZodType<T>
  ): Promise<T | null> {
    return null
  }
}
export function providerFixture() {
  const source = new DataSource({ type: 'postgres', url: 'postgres://unused/unused' })
  const drawings = new ExcalidrawService(
    source.getRepository(ExcalidrawDrawing),
    source.getRepository(ExcalidrawDrawingVersion),
    source.getRepository(ExcalidrawActionLog),
    source.getRepository(ExcalidrawArtifactPublication)
  )
  const reads = new ExcalidrawReadService(
    drawings,
    source.getRepository(ExcalidrawDrawing),
    source.getRepository(ExcalidrawDrawingVersion)
  )
  const operations = new ImmediateOperations(source.getRepository(ExcalidrawOperation))
  const catalog = new ArtifactTemplateCatalogService(new DiagramArtifactTemplateAdapter())
  const compiler = new DiagramCompilerService(
    new DiagramLayoutService(new DiagramRoutingService()),
    new DiagramValidationService()
  )
  const diagrams = new DiagramIrService(
    source.getRepository(DiagramIrRevision),
    drawings,
    compiler,
    new DiagramPreviewService(),
    catalog
  )
  const renders = new ExcalidrawRenderService(
    source.getRepository(ExcalidrawRenderJob),
    reads,
    drawings,
    diagrams,
    operations
  )
  return {
    provider: new ExcalidrawTools(drawings, reads, operations, catalog, diagrams, renders),
    drawings,
    reads,
    operations,
    catalog,
    diagrams,
    renders
  }
}
