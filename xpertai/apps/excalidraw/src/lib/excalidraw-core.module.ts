import { ExcalidrawReadService } from './excalidraw-read.service.js'
import { DiagramIrRevision } from './diagram-engine/entities/index.js'
import { ExcalidrawOperation } from './entities/excalidraw-operation.entity.js'
import { ExcalidrawOperationService } from './excalidraw-operation.service.js'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExcalidrawActionLog, ExcalidrawArtifactPublication, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { ExcalidrawService } from './excalidraw.service.js'
import { ExcalidrawArtifactViewerService } from './excalidraw-artifact-viewer.service.js'

export const EXCALIDRAW_CORE_ENTITIES = [ExcalidrawDrawing, ExcalidrawDrawingVersion, ExcalidrawActionLog, ExcalidrawArtifactPublication, ExcalidrawOperation]

@Module({
  imports: [TypeOrmModule.forFeature([...EXCALIDRAW_CORE_ENTITIES, DiagramIrRevision])],
  providers: [ExcalidrawArtifactViewerService, ExcalidrawService, ExcalidrawOperationService, ExcalidrawReadService],
  exports: [ExcalidrawArtifactViewerService, ExcalidrawService, ExcalidrawOperationService, ExcalidrawReadService]
})
export class ExcalidrawCoreModule {}
