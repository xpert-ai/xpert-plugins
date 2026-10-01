import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WorkspaceRecord, LayoutProposal } from './workspace.entity.js'
import { DockyardWorkspaceService } from './workspace.service.js'
import { DockyardLayoutMiddleware } from './layout.middleware.js'
import { DockyardWorkspaceViewProvider } from './workspace-view.provider.js'

import { ContentRequestRecord } from './content/request.entity.js'
export const ENTITIES = [WorkspaceRecord, LayoutProposal, ContentRequestRecord]
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)], entities: ENTITIES,
  providers: [DockyardWorkspaceService, DockyardLayoutMiddleware, DockyardWorkspaceViewProvider],
  exports: [DockyardWorkspaceService]
})
export class DockyardPlugin {}
