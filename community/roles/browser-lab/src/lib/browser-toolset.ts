import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { XPERTAI_BROWSER_LAB_TOOLSET } from './constants'
import { buildBrowserPlanTool, buildExtractLinksTool, buildSummarizeObservationTool } from './browser-tools'

export class XpertAIBrowserLabToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  constructor() {
    super(XPERTAI_BROWSER_LAB_TOOLSET)
  }

  override async _validateCredentials(_credentials: Record<string, never>): Promise<void> {
    return undefined
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase>[]> {
    this.tools = [buildBrowserPlanTool(), buildExtractLinksTool(), buildSummarizeObservationTool()]
    return this.tools
  }
}
