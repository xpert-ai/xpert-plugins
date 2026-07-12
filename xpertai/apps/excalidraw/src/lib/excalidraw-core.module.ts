import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExcalidrawActionLog, ExcalidrawArtifactPublication, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { ExcalidrawService } from './excalidraw.service.js'
import { ExcalidrawArtifactViewerService } from './excalidraw-artifact-viewer.service.js'

export const EXCALIDRAW_CORE_ENTITIES = [ExcalidrawDrawing, ExcalidrawDrawingVersion, ExcalidrawActionLog, ExcalidrawArtifactPublication]

@Module({
  imports: [TypeOrmModule.forFeature(EXCALIDRAW_CORE_ENTITIES)],
  providers: [ExcalidrawArtifactViewerService, ExcalidrawService],
  exports: [ExcalidrawArtifactViewerService, ExcalidrawService]
})
export class ExcalidrawCoreModule {}
