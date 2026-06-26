import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CanvasActionLog, CanvasDocument, CanvasDocumentVersion } from './entities/index.js'
import { CanvasMiddleware } from './canvas.middleware.js'
import { CanvasService } from './canvas.service.js'
import { CanvasViewProvider } from './canvas-view.provider.js'

export const CANVAS_ENTITIES = [CanvasDocument, CanvasDocumentVersion, CanvasActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CANVAS_ENTITIES)],
  entities: CANVAS_ENTITIES,
  providers: [CanvasService, CanvasMiddleware, CanvasViewProvider],
  exports: [CanvasService]
})
export class CanvasPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${CanvasPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${CanvasPlugin.name} is being destroyed...`)
  }
}
