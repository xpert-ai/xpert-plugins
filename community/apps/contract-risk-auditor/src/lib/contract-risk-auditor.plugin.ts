import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ContractRiskAuditorMiddleware } from './contract-risk-auditor.middleware.js'
import { ContractRiskAuditorService } from './contract-risk-auditor.service.js'
import { ContractRiskAuditorViewProvider } from './contract-risk-auditor-view.provider.js'

@XpertServerPlugin({
  providers: [
    ContractRiskAuditorService,
    ContractRiskAuditorMiddleware,
    ContractRiskAuditorViewProvider
  ],
  exports: [ContractRiskAuditorService]
})
export class ContractRiskAuditorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ContractRiskAuditorPlugin.name} is bootstrapped successfully.`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ContractRiskAuditorPlugin.name} is destroyed.`)
  }
}
