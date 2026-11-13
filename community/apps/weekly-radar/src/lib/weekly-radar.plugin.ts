import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WeeklyRadarEntry, WeeklyRadarWeekly } from './entities'
import { WeeklyRadarMiddleware } from './weekly-radar.middleware'
import { WeeklyRadarService } from './weekly-radar.service'
import { WeeklyRadarToolsetStrategy } from './weekly-radar.toolset'
import { WeeklyRadarViewProvider } from './weekly-radar-view.provider'

const WEEKLY_RADAR_ENTITIES = [WeeklyRadarEntry, WeeklyRadarWeekly]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(WEEKLY_RADAR_ENTITIES)],
  entities: WEEKLY_RADAR_ENTITIES,
  providers: [WeeklyRadarService, WeeklyRadarMiddleware, WeeklyRadarToolsetStrategy, WeeklyRadarViewProvider],
  exports: [WeeklyRadarService]
})
export class WeeklyRadarPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${WeeklyRadarPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${WeeklyRadarPlugin.name} is being destroyed...`)
  }
}
