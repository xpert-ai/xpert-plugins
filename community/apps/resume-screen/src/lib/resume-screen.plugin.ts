/**
 * 简历筛选插件 NestJS 模块
 *
 * 注册插件实体与业务服务/视图提供者：ResumeScreenService 承载领域规则，
 * ResumeScreenViewProvider 向 agent 工作台发布简历初筛视图并代理数据/动作调用。
 */
import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import { ResumeScreenService } from './resume-screen.service'
import { ResumeScreenViewProvider } from './resume-screen-view.provider'

// 插件全部实体集中登记，供 forFeature 与 @XpertServerPlugin 复用，避免两处清单漂移
const RESUME_SCREEN_ENTITIES = [ResumeScreenJob, ResumeScreenCandidate]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_SCREEN_ENTITIES)],
  entities: RESUME_SCREEN_ENTITIES,
  providers: [ResumeScreenService, ResumeScreenViewProvider],
  exports: [ResumeScreenService, ResumeScreenViewProvider]
})
export class ResumeScreenPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  // 生命周期钩子：当前仅注册实体与提供者，无启动期逻辑
  async onPluginBootstrap() {}

  // 生命周期钩子：当前无需要释放的资源
  async onPluginDestroy() {}
}
