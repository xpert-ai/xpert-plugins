import { OfficeWorkbookCollaboration } from './workbooks/collaboration.provider.js'
import { OfficeDocumentContent, OfficeDocumentEditor } from './documents/content.provider.js'
import { OfficeWorkbookService } from './workbooks/service.js'
import { OfficeWorkbookContent, OfficeWorkbookEditor } from './workbooks/content.provider.js'
import { OfficeWorkbookView } from './workbooks/view.provider.js'
import { OfficeFileService } from './office-file.service.js'
import { OfficeFileView } from './office-file-view.provider.js'
import { OfficeXlsFormat, OfficeCsvFormat, OfficeTsvFormat } from './spreadsheets/serialized-file-formats.js'
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'
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
import { OfficeEditorCollaborationProvider } from './office-editor-collaboration.provider.js'
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
    OfficeDocumentContent, OfficeDocumentEditor,
    OfficeWorkbookCollaboration, OfficeWorkbookService, OfficeWorkbookContent, OfficeWorkbookEditor, OfficeWorkbookView,
    OfficeSpreadsheetFormat, OfficeXlsFormat, OfficeCsvFormat, OfficeTsvFormat,
    OfficeFileService,
    OfficeFileView,
    OfficeEditorService,
    OfficeEditorMiddleware,
    OfficeEditorViewProvider,
    OfficeEditorCollaborationProvider
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
