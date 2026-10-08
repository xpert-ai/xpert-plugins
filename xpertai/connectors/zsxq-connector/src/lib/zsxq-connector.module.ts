import { IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SystemZsxqCliRunner, ZsxqCliRunner } from './cli/zsxq-cli.runner.js'
import { ZsxqCliService } from './cli/zsxq-cli.service.js'
import { ZsxqConnectorStrategy } from './connector/zsxq-connector.strategy.js'
import { ZsxqConnectorRuntimeMiddleware } from './middlewares/zsxq-connector-runtime.middleware.js'
import { ZsxqConfirmationStore } from './tools/confirmation-store.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    { provide: ZsxqCliRunner, useClass: SystemZsxqCliRunner },
    ZsxqCliService,
    ZsxqConfirmationStore,
    ZsxqConnectorStrategy,
    ZsxqConnectorRuntimeMiddleware
  ],
  exports: [ZsxqCliService, ZsxqConnectorStrategy]
})
export class ZsxqConnectorPluginModule implements IOnPluginDestroy {
  constructor(private readonly cli: ZsxqCliService) {}

  onPluginDestroy(): void {
    this.cli.stopAll()
  }
}
