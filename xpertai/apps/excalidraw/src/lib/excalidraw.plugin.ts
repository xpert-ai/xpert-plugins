import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DiagramEngineModule, EXCALIDRAW_DIAGRAM_ENTITIES } from './diagram-engine/diagram-engine.module.js'
import { ExcalidrawCoreModule, EXCALIDRAW_CORE_ENTITIES } from './excalidraw-core.module.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExcalidrawTools } from './tools/excalidraw-tools.provider.js'
import { ExcalidrawRenderJob } from './entities/excalidraw-render-job.entity.js'
import { ExcalidrawRenderService } from './rendering/excalidraw-render.service.js'
import { ExcalidrawRenderProcessor } from './rendering/excalidraw-render.processor.js'
import { ExcalidrawViewProvider } from './excalidraw-view.provider.js'
import { ExcalidrawCollaborationProvider } from './excalidraw-collaboration.provider.js'

export const EXCALIDRAW_ENTITIES = [...EXCALIDRAW_CORE_ENTITIES, ...EXCALIDRAW_DIAGRAM_ENTITIES, ExcalidrawRenderJob]

@XpertServerPlugin({
  imports: [ExcalidrawCoreModule, DiagramEngineModule, TypeOrmModule.forFeature([ExcalidrawRenderJob])],
  entities: EXCALIDRAW_ENTITIES,
  providers: [ExcalidrawTools, ExcalidrawRenderService, ExcalidrawRenderProcessor, ExcalidrawViewProvider, ExcalidrawCollaborationProvider],
  exports: [ExcalidrawCoreModule, DiagramEngineModule]
})
export class ExcalidrawPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {

  }

  onPluginDestroy(): void | Promise<void> {

  }
}
