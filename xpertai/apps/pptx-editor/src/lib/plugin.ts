import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PptxFormat } from './format.js'
import { PptxFiles } from './files.js'
import { PptxView } from './view.js'
import { PptxResourceEditor } from './resource-editor.js'
import { PptxAi } from './ai-service.js'
import { PptxEngine } from './ai-engine.js'
import { PptxAiMiddleware } from './ai-middleware.js'
import { PptxAssistantCapability } from './assistant-capability.js'
import { PptxTemplates } from './template-service.js'
import { PptxPreview } from './preview.js'
import { PptxPreviewProcessor } from './preview-processor.js'

@XpertServerPlugin({ providers: [PptxFormat, PptxResourceEditor, PptxFiles, PptxView, PptxEngine, PptxTemplates, PptxPreview, PptxPreviewProcessor, PptxAi, PptxAiMiddleware, PptxAssistantCapability] })
export class PptxEditorPlugin {}
