import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { LucidchartActionLog, LucidchartDocument, LucidchartDocumentVersion } from './entities/index.js'
import { LucidchartMiddleware } from './lucidchart.middleware.js'
import { LucidchartService } from './lucidchart.service.js'
import { LucidchartViewProvider } from './lucidchart-view.provider.js'

export const LUCIDCHART_ENTITIES = [LucidchartDocument, LucidchartDocumentVersion, LucidchartActionLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(LUCIDCHART_ENTITIES)],
  entities: LUCIDCHART_ENTITIES,
  providers: [LucidchartService, LucidchartMiddleware, LucidchartViewProvider],
  exports: [LucidchartService]
})
export class LucidchartPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${LucidchartPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${LucidchartPlugin.name} is being destroyed...`)
  }
}
