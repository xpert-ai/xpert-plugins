import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type IOnPluginBootstrap, type IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { MeetingRecord, AnalysisAttempt } from './entities.js'
import { MeetingRecordService } from './meeting-record.service.js'
import { AnalysisService } from './analysis.service.js'
import { AnalysisBackgroundService } from './analysis-background.service.js'
import { MeetingTools } from './meeting-tools.js'
import { MeetingViewProvider } from './meeting-view.provider.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([MeetingRecord, AnalysisAttempt])], entities: [MeetingRecord, AnalysisAttempt],
  providers: [MeetingRecordService, AnalysisService, AnalysisBackgroundService, MeetingTools, MeetingViewProvider]
})
export class MeetingActionReviewPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly background: AnalysisBackgroundService) {}
  onPluginBootstrap() { this.background.start() }
  onPluginDestroy() { this.background.stop() }
}
