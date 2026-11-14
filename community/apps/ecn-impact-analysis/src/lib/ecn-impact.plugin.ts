import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { EcnImpactMiddleware } from './ecn-impact.middleware'
import { EcnImpactService } from './ecn-impact.service'
import { EcnImpactViewProvider } from './ecn-impact-view.provider'
import { MockEcnSystemGateway } from './ecn-system-gateway'
import { EcnAssessmentEntity, EcnAssessmentLogEntity, EcnImpactItemEntity } from './entities'

const ECN_IMPACT_ENTITIES = [EcnAssessmentEntity, EcnImpactItemEntity, EcnAssessmentLogEntity]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ECN_IMPACT_ENTITIES)],
  entities: ECN_IMPACT_ENTITIES,
  providers: [EcnImpactService, MockEcnSystemGateway, EcnImpactMiddleware, EcnImpactViewProvider],
  exports: [EcnImpactService]
})
export class EcnImpactPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${EcnImpactPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${EcnImpactPlugin.name} is being destroyed...`)
  }
}
