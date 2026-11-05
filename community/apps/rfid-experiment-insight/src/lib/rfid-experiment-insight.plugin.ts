import { Logger } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type IOnPluginBootstrap, type IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { ExperimentAnalysis } from './entities/experiment-analysis.entity.js'
import { RfidExperimentInsightService } from './rfid-experiment-insight.service.js'
import { RfidExperimentInsightMiddleware } from './rfid-experiment-insight.middleware.js'
import { RfidExperimentInsightViewProvider } from './rfid-experiment-insight-view.provider.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([ExperimentAnalysis])], entities: [ExperimentAnalysis],
  providers: [RfidExperimentInsightService, RfidExperimentInsightMiddleware, RfidExperimentInsightViewProvider],
  exports: [RfidExperimentInsightService]
})
export class RfidExperimentInsightPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private readonly logger = new Logger(RfidExperimentInsightPlugin.name)
  onPluginBootstrap() { this.logger.log('RFID Experiment Insight bootstrapped') }
  onPluginDestroy() { this.logger.log('RFID Experiment Insight destroyed') }
}
