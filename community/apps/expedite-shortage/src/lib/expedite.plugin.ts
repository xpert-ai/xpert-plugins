/**
 * 插件的服务端模块（NestJS Module）：登记本插件要放进平台进程的所有组件。
 *
 * - entities：数据表（阶段 3 加入）
 * - providers：服务、中间件、视图提供者等“可注入的类”
 * Python 类比：像 FastAPI 的 app.include_router(...) + 依赖注入容器的注册表，
 * 平台启动时读这份清单，把这些类实例化并连好依赖。
 */
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ExpediteShortageMiddleware } from './expedite.middleware.js'

/** 本插件注册的数据表实体（阶段 2 暂无） */
export const ENTITIES = []

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [ExpediteShortageMiddleware]
})
export class ExpediteShortagePlugin {}
