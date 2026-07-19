import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CanvasActionLog, CanvasArtifactExport, CanvasDocument, CanvasDocumentVersion } from './entities/index.js'
import { CanvasCollaborationProvider } from './canvas-collaboration.provider.js'
import { CanvasMiddleware } from './canvas.middleware.js'
import { CanvasService } from './canvas.service.js'
import { CanvasViewProvider } from './canvas-view.provider.js'
import { CanvasArtifactService } from './canvas-artifact.service.js'
import { CanvasArtifactViewerService } from './canvas-artifact-viewer.service.js'
import { CanvasArtifactExportService } from './canvas-artifact-export.service.js'
import { CanvasArtifactExportProcessor } from './canvas-artifact-export.processor.js'

export const CANVAS_ENTITIES = [CanvasDocument, CanvasDocumentVersion, CanvasActionLog, CanvasArtifactExport]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CANVAS_ENTITIES)],
  entities: CANVAS_ENTITIES,
  providers: [
    CanvasArtifactViewerService,
    CanvasArtifactService,
    CanvasArtifactExportService,
    CanvasArtifactExportProcessor,
    CanvasService,
    CanvasMiddleware,
    CanvasViewProvider,
    CanvasCollaborationProvider
  ],
  exports: [CanvasService, CanvasArtifactExportService]
})
export class CanvasPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${CanvasPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${CanvasPlugin.name} is being destroyed...`)
  }
}
