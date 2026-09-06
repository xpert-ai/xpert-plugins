import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MATERIAL_ENTITIES } from './entities.js'
import { MaterialCaseService } from './case.service.js'
import { MaterialTaskService } from './task.service.js'
import { MaterialTaskProcessor } from './task.processor.js'
import { MaterialGovernanceTools } from './middlewares.js'
import { MaterialProfileProvider } from './profile.provider.js'
import { MaterialProfileService } from './profile.service.js'
import { MaterialViewProvider } from './view.provider.js'
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(MATERIAL_ENTITIES)],
  entities: MATERIAL_ENTITIES,
  providers: [
    MaterialCaseService,
    MaterialTaskService,
    MaterialTaskProcessor,
    MaterialGovernanceTools,
    MaterialViewProvider,
    MaterialProfileService,
    MaterialProfileProvider,
  ],
  exports: [MaterialCaseService, MaterialTaskService],
})
export class MaterialGovernancePlugin {}
