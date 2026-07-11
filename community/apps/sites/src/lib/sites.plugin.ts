import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesShareLink, SitesVersion } from './entities/index.js'
import { SitesHostingController } from './sites-hosting.controller.js'
import { SitesMiddleware } from './sites.middleware.js'
import { SitesService } from './sites.service.js'
import { SitesViewProvider } from './sites-view.provider.js'

const SITES_ENTITIES = [SitesProject, SitesVersion, SitesDeployment, SitesEnvironmentVariable, SitesShareLink]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SITES_ENTITIES)],
  entities: SITES_ENTITIES,
  controllers: [SitesHostingController],
  providers: [SitesService, SitesMiddleware, SitesViewProvider],
  exports: [SitesService]
})
export class SitesPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SitesPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SitesPlugin.name} is being destroyed...`)
    }
  }
}
