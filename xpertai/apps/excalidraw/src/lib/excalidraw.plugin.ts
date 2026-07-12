import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DiagramEngineModule, EXCALIDRAW_DIAGRAM_ENTITIES } from './diagram-engine/diagram-engine.module.js'
import { ExcalidrawCoreModule, EXCALIDRAW_CORE_ENTITIES } from './excalidraw-core.module.js'
import { ExcalidrawMiddleware } from './excalidraw.middleware.js'
import { ExcalidrawViewProvider } from './excalidraw-view.provider.js'
import { ExcalidrawCollaborationProvider } from './excalidraw-collaboration.provider.js'

export const EXCALIDRAW_ENTITIES = [...EXCALIDRAW_CORE_ENTITIES, ...EXCALIDRAW_DIAGRAM_ENTITIES]

@XpertServerPlugin({
  imports: [ExcalidrawCoreModule, DiagramEngineModule],
  entities: EXCALIDRAW_ENTITIES,
  providers: [ExcalidrawMiddleware, ExcalidrawViewProvider, ExcalidrawCollaborationProvider],
  exports: [ExcalidrawCoreModule, DiagramEngineModule]
})
export class ExcalidrawPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ExcalidrawPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ExcalidrawPlugin.name} is being destroyed...`)
  }
}
