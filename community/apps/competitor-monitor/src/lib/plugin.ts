// 依赖装配：注册五类实体，将业务服务、中间件和工作台提供者交给 Nest 管理。
import {TypeOrmModule} from '@nestjs/typeorm'
import {XpertServerPlugin} from '@xpert-ai/plugin-sdk'
import {ENTITIES} from './entities.js'
import {CompetitorMonitorMiddleware} from './middleware.js'
import {MonitorService} from './service.js'
import {CompetitorMonitorViewProvider} from './view.provider.js'
@XpertServerPlugin({imports:[TypeOrmModule.forFeature(ENTITIES)],entities:ENTITIES,providers:[MonitorService,CompetitorMonitorMiddleware,CompetitorMonitorViewProvider],exports:[MonitorService]})
export class CompetitorMonitorPlugin{}
