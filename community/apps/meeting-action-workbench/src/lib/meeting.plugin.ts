import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  MeetingActionItem,
  MeetingDecision,
  MeetingExecutionReview,
  MeetingOperation,
  MeetingRecord,
  MeetingRiskSignal
} from './entities'
import { MeetingMiddleware } from './meeting.middleware'
import { MeetingService } from './meeting.service'
import { MeetingViewProvider } from './meeting-view.provider'

const MEETING_ENTITIES = [
  MeetingRecord,
  MeetingDecision,
  MeetingActionItem,
  MeetingOperation,
  MeetingExecutionReview,
  MeetingRiskSignal
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(MEETING_ENTITIES)],
  entities: MEETING_ENTITIES,
  providers: [MeetingService, MeetingMiddleware, MeetingViewProvider],
  exports: [MeetingService]
})
export class MeetingActionWorkbenchPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${MeetingActionWorkbenchPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${MeetingActionWorkbenchPlugin.name} is being destroyed...`)
  }
}
