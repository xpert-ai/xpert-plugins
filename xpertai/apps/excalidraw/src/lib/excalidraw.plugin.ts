import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ExcalidrawActionLog, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { ExcalidrawMiddleware } from './excalidraw.middleware.js'
import { ExcalidrawService } from './excalidraw.service.js'
import { ExcalidrawViewProvider } from './excalidraw-view.provider.js'

export const EXCALIDRAW_ENTITIES = [ExcalidrawDrawing, ExcalidrawDrawingVersion, ExcalidrawActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(EXCALIDRAW_ENTITIES)],
  entities: EXCALIDRAW_ENTITIES,
  providers: [ExcalidrawService, ExcalidrawMiddleware, ExcalidrawViewProvider],
  exports: [ExcalidrawService]
})
export class ExcalidrawPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ExcalidrawPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ExcalidrawPlugin.name} is being destroyed...`)
  }
}
