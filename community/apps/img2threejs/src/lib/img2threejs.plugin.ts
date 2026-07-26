import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule } from '@nestjs/core'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { IMG2THREEJS_ENTITIES } from './entities/index.js'
import { Img2ThreeJsController } from './img2threejs.controller.js'
import { Img2ThreeJsAgentQueryService } from './img2threejs-agent-query.service.js'
import { Img2ThreeJsMiddleware } from './img2threejs.middleware.js'
import { Img2ThreeJsQueueProcessor, Img2ThreeJsRenderQueueProcessor } from './img2threejs-queue.processor.js'
import { Img2ThreeJsRenderService } from './img2threejs-render.service.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import { Img2ThreeJsStudioService } from './img2threejs-studio.service.js'
import { Img2ThreeJsViewProvider } from './img2threejs-view.provider.js'
import { Img2ThreeJsWorkbenchService } from './img2threejs-workbench.service.js'

@XpertServerPlugin({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([...IMG2THREEJS_ENTITIES])
  ],
  entities: [...IMG2THREEJS_ENTITIES],
  controllers: [Img2ThreeJsController],
  providers: [
    Img2ThreeJsService,
    Img2ThreeJsAgentQueryService,
    Img2ThreeJsRenderService,
    Img2ThreeJsMiddleware,
    Img2ThreeJsQueueProcessor,
    Img2ThreeJsRenderQueueProcessor,
    Img2ThreeJsWorkbenchService,
    Img2ThreeJsStudioService,
    Img2ThreeJsViewProvider
  ],
  exports: [Img2ThreeJsService]
})
export class Img2ThreeJsPlugin {}
