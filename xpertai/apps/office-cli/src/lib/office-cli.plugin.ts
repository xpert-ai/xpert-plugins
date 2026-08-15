import { Logger } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { OfficeCliDocument, OfficeCliVersion } from './entities/index.js'
import { OfficeCliMiddleware } from './office-cli.middleware.js'
import { OfficeCliRuntimeService } from './office-cli-runtime.service.js'
import { OfficeCliService } from './office-cli.service.js'
import { OfficeCliViewProvider } from './office-cli-view.provider.js'

export const OFFICE_CLI_ENTITIES = [OfficeCliDocument, OfficeCliVersion]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(OFFICE_CLI_ENTITIES)],
  entities: OFFICE_CLI_ENTITIES,
  providers: [
    OfficeCliRuntimeService,
    OfficeCliService,
    OfficeCliMiddleware,
    OfficeCliViewProvider
  ],
  exports: [OfficeCliRuntimeService, OfficeCliService]
})
export class OfficeCliPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private readonly logger = new Logger(OfficeCliPlugin.name)

  constructor(private readonly runtime: OfficeCliRuntimeService) {}

  onPluginBootstrap(): void {
    void this.runtime.prewarm().catch((error) => {
      this.logger.error(
        `OfficeCLI runtime prewarm failed. Preview requests will retry automatically. ${getErrorMessage(error)}`
      )
    })
  }

  onPluginDestroy(): void {
    // OfficeCLI runs as bounded child processes; no resident process is retained by the plugin.
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
