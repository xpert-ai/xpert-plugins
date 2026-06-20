import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  CrmActivity,
  CrmFieldDefinition,
  CrmObjectDefinition,
  CrmRecord,
  CrmRelationDefinition,
  CrmViewDefinition
} from './entities'
import { CrmMetadataService } from './crm-metadata.service'
import { CrmMiddleware } from './crm.middleware'
import { CrmRecordService } from './crm-record.service'
import { CrmSeedService } from './crm-seed.service'
import { CrmService } from './crm.service'
import { CrmViewProvider } from './crm-view.provider'

const CRM_ENTITIES = [
  CrmObjectDefinition,
  CrmFieldDefinition,
  CrmRelationDefinition,
  CrmRecord,
  CrmViewDefinition,
  CrmActivity
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CRM_ENTITIES)],
  entities: CRM_ENTITIES,
  providers: [CrmMetadataService, CrmRecordService, CrmSeedService, CrmService, CrmMiddleware, CrmViewProvider],
  exports: [CrmService, CrmMetadataService, CrmRecordService]
})
export class CrmPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${CrmPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${CrmPlugin.name} is being destroyed...`)
  }
}
