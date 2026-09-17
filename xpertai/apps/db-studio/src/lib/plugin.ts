import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { StudioRecord, StudioPolicy } from './entities.js'
import { StudioJobs, StudioJobProcessor } from './jobs.js'
import { StudioService } from './studio.service.js'
import { StudioAccess } from './access.js'
import { StudioViewProvider } from './view.provider.js'
import { DbStudioExploreMiddleware, DbStudioChangesMiddleware, DbStudioTransferMiddleware } from './middleware.js'
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([StudioRecord, StudioPolicy])],
  entities: [StudioRecord, StudioPolicy],
  providers: [
    StudioJobs,
    StudioJobProcessor,
    StudioAccess,
    StudioService,
    StudioViewProvider,
    DbStudioExploreMiddleware,
    DbStudioChangesMiddleware,
    DbStudioTransferMiddleware,
  ],
  exports: [StudioService],
})
export class DbStudioPlugin {}
