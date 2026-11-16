import { DocxAi } from './native/ai-service.js'
import { DocxEngine } from './native/ai-engine.js'
import { DocxFileMiddleware } from './native/ai-middleware.js'
import { DocxFileCapability } from './native/assistant-capability.js'
import { DocxFormat } from './native/format.js'
import { DocxResourceEditor } from './native/resource-editor.js'
import { DocxFiles } from './native/files.js'
import { DocxFileView } from './native/view.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  DocxEditorDocument,
  DocxEditorOperation,
  DocxEditorSnapshot,
  DocxEditorVersion
} from './entities/index.js'
import { DocxEditorMiddleware } from './docx-editor.middleware.js'
import { DocxEditorArtifactViewerService } from './docx-editor-artifact-viewer.service.js'
import { DocxEditorService } from './docx-editor.service.js'
import { DocxEditorViewProvider } from './docx-editor-view.provider.js'

export const DOCX_EDITOR_ENTITIES = [
  DocxEditorDocument,
  DocxEditorVersion,
  DocxEditorSnapshot,
  DocxEditorOperation
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(DOCX_EDITOR_ENTITIES)],
  entities: DOCX_EDITOR_ENTITIES,
  providers: [DocxAi, DocxEngine, DocxFileMiddleware, DocxFileCapability, DocxFormat, DocxResourceEditor, DocxFiles, DocxFileView, DocxEditorArtifactViewerService, DocxEditorService, DocxEditorMiddleware, DocxEditorViewProvider],
  exports: [DocxEditorService]
})
export class DocxEditorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${DocxEditorPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${DocxEditorPlugin.name} is being destroyed...`)
  }
}
