import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeMatchAnalysisEntity } from './entities/resume-match-analysis.entity.js'
import { ResumeMatchService } from './analysis.service.js'
import { ResumeMatchMiddleware } from './middleware.js'
import { ResumeMatchViewProvider } from './view.provider.js'

const ENTITIES = [ResumeMatchAnalysisEntity]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [ResumeMatchService, ResumeMatchMiddleware, ResumeMatchViewProvider],
  exports: [ResumeMatchService]
})
export class ResumeMatchPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${ResumeMatchPlugin.name} bootstrapped`)
  }

  onPluginDestroy(): void {
    console.log(`${ResumeMatchPlugin.name} destroyed`)
  }
}
