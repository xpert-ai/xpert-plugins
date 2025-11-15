import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { buildZipTool } from './zip.tool.js'
import { buildUnzipTool } from './unzip.tool.js'

export class ZipToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  override async _validateCredentials(credentials: Record<string, never>): Promise<void> {
    // No credentials needed for zip toolset
  }
  
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = [buildZipTool(), buildUnzipTool()]
    return this.tools
  }
}

