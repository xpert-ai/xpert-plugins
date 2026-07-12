import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExcalidrawCoreModule } from '../excalidraw-core.module.js'
import { ArtifactTemplateCatalogService, DiagramArtifactTemplateAdapter } from './artifact-template-catalog.service.js'
import { DiagramIrService } from './diagram-ir.service.js'
import { DiagramLayoutService, DiagramRoutingService } from './diagram-layout.service.js'
import { ExcalidrawDiagramEngineMiddleware } from './diagram.middleware.js'
import { DiagramCompilerService, DiagramPreviewService, DiagramValidationService } from './diagram-rendering.service.js'
import { DiagramIrRevision } from './entities/index.js'

export const EXCALIDRAW_DIAGRAM_ENTITIES = [DiagramIrRevision]

@Module({
  imports: [ExcalidrawCoreModule, TypeOrmModule.forFeature(EXCALIDRAW_DIAGRAM_ENTITIES)],
  providers: [
    DiagramArtifactTemplateAdapter,
    ArtifactTemplateCatalogService,
    DiagramRoutingService,
    DiagramLayoutService,
    DiagramValidationService,
    DiagramCompilerService,
    DiagramPreviewService,
    DiagramIrService,
    ExcalidrawDiagramEngineMiddleware
  ],
  exports: [
    ArtifactTemplateCatalogService,
    DiagramIrService,
    DiagramRoutingService,
    DiagramLayoutService,
    DiagramValidationService,
    DiagramCompilerService,
    DiagramPreviewService
  ]
})
export class DiagramEngineModule {}
