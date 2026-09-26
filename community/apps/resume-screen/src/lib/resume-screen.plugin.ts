/**
 * 简历筛选插件 NestJS 模块（当前为最小壳版本）
 *
 * 仅负责向 TypeORM 注册插件实体，保证表结构可被系统感知；
 * 服务/中间件/视图提供者随后续阶段逐步补齐。
 */
import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'

// 插件全部实体集中登记，供 forFeature 与 @XpertServerPlugin 复用，避免两处清单漂移
const RESUME_SCREEN_ENTITIES = [ResumeScreenJob, ResumeScreenCandidate]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_SCREEN_ENTITIES)],
  entities: RESUME_SCREEN_ENTITIES,
  providers: [],
  exports: []
})
export class ResumeScreenPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  // 生命周期钩子：当前仅注册实体，无启动期逻辑
  async onPluginBootstrap() {}

  // 生命周期钩子：当前无需要释放的资源
  async onPluginDestroy() {}
}
