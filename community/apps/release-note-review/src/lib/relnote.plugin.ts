import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { RelnoteAiRun, RelnoteRelease } from './entities/index.js'
import { RelnoteMiddleware } from './relnote.middleware.js'
import { RelnoteService } from './relnote.service.js'
import { RelnoteViewProvider } from './relnote-view.provider.js'
@XpertServerPlugin({ imports: [TypeOrmModule.forFeature([RelnoteRelease, RelnoteAiRun])], entities: [RelnoteRelease, RelnoteAiRun], providers: [RelnoteService, RelnoteMiddleware, RelnoteViewProvider], exports: [RelnoteService] })
export class RelnotePlugin {}
