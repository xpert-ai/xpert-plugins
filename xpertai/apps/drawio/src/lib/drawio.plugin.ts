import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DrawioActionLog, DrawioDrawing, DrawioDrawingVersion } from './entities/index.js'
import { DrawioMiddleware } from './drawio.middleware.js'
import { DrawioService } from './drawio.service.js'
import { DrawioViewProvider } from './drawio-view.provider.js'

export const DRAWIO_ENTITIES = [DrawioDrawing, DrawioDrawingVersion, DrawioActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(DRAWIO_ENTITIES)],
  entities: DRAWIO_ENTITIES,
  providers: [DrawioService, DrawioMiddleware, DrawioViewProvider],
  exports: [DrawioService]
})
export class DrawioPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${DrawioPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${DrawioPlugin.name} is being destroyed...`)
  }
}
