import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  OfficeDocument,
  OfficeFileVersion,
  OfficeOperation,
  OfficeSnapshot,
  OfficeYjsUpdate
} from './entities/index.js'
import { OfficeEditorCollabGateway } from './office-editor-collab.gateway.js'
import { OfficeEditorMiddleware } from './office-editor.middleware.js'
import { OfficeEditorService } from './office-editor.service.js'
import { OfficeEditorViewProvider } from './office-editor-view.provider.js'

export const OFFICE_EDITOR_ENTITIES = [
  OfficeDocument,
  OfficeFileVersion,
  OfficeSnapshot,
  OfficeYjsUpdate,
  OfficeOperation
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(OFFICE_EDITOR_ENTITIES)],
  entities: OFFICE_EDITOR_ENTITIES,
  providers: [
    OfficeEditorService,
    OfficeEditorMiddleware,
    OfficeEditorViewProvider,
    OfficeEditorCollabGateway
  ],
  exports: [OfficeEditorService]
})
export class OfficeEditorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${OfficeEditorPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${OfficeEditorPlugin.name} is being destroyed...`)
  }
}
