import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PptxFormat } from './format.js'
import { PptxFiles } from './files.js'
import { PptxView } from './view.js'
import { PptxResourceEditor } from './resource-editor.js'

@XpertServerPlugin({ providers: [PptxFormat, PptxResourceEditor, PptxFiles, PptxView] })
export class PptxEditorPlugin {}
