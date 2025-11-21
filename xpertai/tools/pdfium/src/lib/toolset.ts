import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { buildPdfToMarkdownTool } from './pdf2markdown.tool.js'

export class PdfiumToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  override async _validateCredentials(_credentials: Record<string, never>): Promise<void> {
    // No credentials needed
  }
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = [buildPdfToMarkdownTool()]
    return this.tools
  }
}
