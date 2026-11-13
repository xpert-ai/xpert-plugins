/**
 * 插件的服务端模块（NestJS Module）：登记本插件要放进平台进程的所有组件。
 *
 * - entities：4 张数据表，平台启动时按实体自动建表
 * - providers：服务、数据源、时钟、中间件等“可注入的类”
 * Python 类比：像 FastAPI 的 app.include_router(...) + 依赖注入容器的注册表，
 * 平台启动时读这份清单，把这些类实例化并连好依赖。
 */
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { EXPEDITE_CLOCK, systemClock } from './clock.js'
import { ENTITIES } from './entities/index.js'
import { ExpediteShortageMiddleware } from './expedite.middleware.js'
import { ExpediteService } from './expedite.service.js'
import { MockSupplyDataSource } from './supply/mock-supply-data-source.js'
import { SupplyDataSource } from './supply/supply-data-source.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [
    // 需要 SupplyDataSource 的地方注入 MockSupplyDataSource；将来接 ERP 只改这一行
    { provide: SupplyDataSource, useClass: MockSupplyDataSource },
    { provide: EXPEDITE_CLOCK, useValue: systemClock },
    ExpediteService,
    ExpediteShortageMiddleware
  ],
  exports: [ExpediteService]
})
export class ExpediteShortagePlugin {}
