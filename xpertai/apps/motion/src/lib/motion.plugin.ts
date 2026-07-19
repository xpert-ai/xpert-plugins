import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MotionActionLog, MotionExport, MotionProject, MotionProjectVersion, MotionStyle } from './entities/index.js'
import { MotionMiddleware } from './motion.middleware.js'
import { MotionRenderProcessor } from './motion-render.processor.js'
import { MotionService } from './motion.service.js'
import { MotionViewProvider } from './motion-view.provider.js'

export const MOTION_ENTITIES = [MotionProject, MotionProjectVersion, MotionStyle, MotionExport, MotionActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(MOTION_ENTITIES)],
  entities: MOTION_ENTITIES,
  providers: [MotionService, MotionMiddleware, MotionViewProvider, MotionRenderProcessor],
  exports: [MotionService]
})
export class MotionPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${MotionPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${MotionPlugin.name} is being destroyed...`)
  }
}
