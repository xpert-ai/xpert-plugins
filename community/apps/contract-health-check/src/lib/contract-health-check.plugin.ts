import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  ContractReview,
  ContractReviewJob,
  ContractRiskItem,
  ContractSuggestion
} from './entities/index.js'
import { ContractHealthCheckMiddleware } from './contract-health-check.middleware.js'
import { ContractHealthCheckService } from './contract-health-check.service.js'
import { ContractHealthCheckViewProvider } from './contract-health-check-view.provider.js'

export const CONTRACT_HEALTH_CHECK_ENTITIES = [
  ContractReview,
  ContractRiskItem,
  ContractSuggestion,
  ContractReviewJob
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CONTRACT_HEALTH_CHECK_ENTITIES)],
  entities: CONTRACT_HEALTH_CHECK_ENTITIES,
  providers: [ContractHealthCheckService, ContractHealthCheckMiddleware, ContractHealthCheckViewProvider],
  exports: [ContractHealthCheckService]
})
export class ContractHealthCheckPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ContractHealthCheckPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ContractHealthCheckPlugin.name} is being destroyed...`)
    }
  }
}
