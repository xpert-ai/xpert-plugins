import { MaterialPipelineService } from '../pipeline/service.js'
import { MaterialPipelineContribution } from '../pipeline/configuration.js'
import { materialPipelineAdapters } from '../pipeline/adapters.js'
import { MaterialProjectTypeProvider } from './project-type.provider.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MATERIAL_ENTITIES } from './entities.js'
import { MaterialCaseService } from './case.service.js'
import { MaterialGovernanceTools } from './middlewares.js'
import { MaterialProfileProvider } from './profile.provider.js'
import { MaterialProfileService } from './profile.service.js'
import { MaterialViewProvider } from './view.provider.js'
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(MATERIAL_ENTITIES)],
  entities: MATERIAL_ENTITIES,
  providers: [
    MaterialPipelineService, MaterialPipelineContribution, ...materialPipelineAdapters, MaterialProjectTypeProvider,
    MaterialCaseService,
    MaterialGovernanceTools,
    MaterialViewProvider,
    MaterialProfileService,
    MaterialProfileProvider,
  ],
  exports: [MaterialCaseService, MaterialPipelineService],
})
export class MaterialGovernancePlugin {}
