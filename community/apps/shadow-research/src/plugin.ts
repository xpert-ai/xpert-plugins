import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResearchTaskEntity } from './task.entity.js'
import { PersistentTaskStore } from './task.store.js'
import { ResearchService } from './research.service.js'
import { ShadowResearchMiddleware } from './middleware.js'
import { ResearchViewProvider } from './view.provider.js'
@XpertServerPlugin({imports:[TypeOrmModule.forFeature([ResearchTaskEntity])],entities:[ResearchTaskEntity],
  providers:[PersistentTaskStore,ResearchService,ShadowResearchMiddleware,ResearchViewProvider],exports:[ResearchService]})
export class ShadowResearchPlugin {}
