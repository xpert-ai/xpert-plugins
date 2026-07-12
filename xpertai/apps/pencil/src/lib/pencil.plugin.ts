import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PencilActionLog, PencilDocument, PencilDocumentVersion } from './entities/index.js'
import { PencilCollaborationProvider } from './pencil-collaboration.provider.js'
import { PencilMiddleware } from './pencil.middleware.js'
import { PencilService } from './pencil.service.js'
import { PencilViewProvider } from './pencil-view.provider.js'

export const PENCIL_ENTITIES = [PencilDocument, PencilDocumentVersion, PencilActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(PENCIL_ENTITIES)],
  entities: PENCIL_ENTITIES,
  providers: [PencilService, PencilMiddleware, PencilViewProvider, PencilCollaborationProvider],
  exports: [PencilService]
})
export class PencilPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${PencilPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${PencilPlugin.name} is being destroyed...`)
  }
}
