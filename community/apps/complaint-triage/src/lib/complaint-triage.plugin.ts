import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ENTITIES } from './ticket.entity.js'
import { ComplaintTriageMiddleware } from './triage.middleware.js'
import { ComplaintTriageService } from './triage.service.js'
import { ComplaintTriageViewProvider } from './triage-view.provider.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [ComplaintTriageService, ComplaintTriageMiddleware, ComplaintTriageViewProvider],
  exports: [ComplaintTriageService]
})
export class ComplaintTriagePlugin {}
