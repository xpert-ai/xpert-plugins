import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
  NOTION_CONNECTOR_PROVIDER,
  NOTION_PUBLIC_OAUTH_AUTH_METHOD,
  NOTION_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { NotionConnectorError, readString } from './errors.js'
import { NotionApiClient, type NotionRuntimeCredential } from './notion-api.client.js'
import { blocksToMarkdown, mapBlock, type NotionBlock } from './notion-mapper.js'
import { defineAgentTool } from './tools/define-agent-tool.js'
import { NOTION_ICON } from './branding.js'
import {
  getNotionDataSourceSchema,
  getNotionPageSchema,
  queryNotionDataSourceSchema,
  readNotionPageSchema,
  searchNotionSchema,
  type GetNotionDataSourceInput,
  type GetNotionPageInput,
  type QueryNotionDataSourceInput,
  type ReadNotionPageInput,
  type SearchNotionInput
} from './tools/schemas.js'

type RuntimeConfig = { provider?: string; connectorId?: string }
type HiddenMiddlewareMeta = {
  name: string
  label: { en_US: string; zh_Hans: string }
  description: { en_US: string; zh_Hans: string }
  icon: typeof NOTION_ICON
  builtin: true
  configSchema: { type: 'object'; properties: Record<string, never> }
}

@Injectable()
@AgentMiddlewareStrategy(NOTION_RUNTIME_MIDDLEWARE_NAME)
export class NotionConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<RuntimeConfig> {
  readonly meta: HiddenMiddlewareMeta = {
    name: NOTION_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'Notion connector runtime', zh_Hans: 'Notion 连接器运行时' },
    description: {
      en_US: 'Bounded read-only Agent tools for an authorized Notion workspace.',
      zh_Hans: '为已授权 Notion 工作区提供受限只读 Agent 工具。'
    },
    icon: NOTION_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly api: NotionApiClient) {}

  createMiddleware(options: RuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolve = () => resolveRuntime(options, context)
    return {
      name: NOTION_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool<SearchNotionInput>(
          async (input) => {
            const runtime = await resolve()
            const result = await this.api.search(runtime, {
              query: input.query,
              resultType: input.result_type,
              cursor: input.start_cursor,
              pageSize: input.page_size
            })
            return result
          },
          {
            name: 'notion_search',
            description:
              'Search shared Notion pages or data sources by title. Results are bounded summaries; use notion_get_page or notion_read_page for details.',
            schema: searchNotionSchema,
            verboseParsingErrors: true
          }
        ),
        defineAgentTool<GetNotionPageInput>(
          async (input) => {
            const runtime = await resolve()
            return this.api.retrievePage(runtime, input.page_id)
          },
          {
            name: 'notion_get_page',
            description:
              'Get metadata and allowlisted properties for one exact Notion page discovered from a previous tool result. Blocks are intentionally omitted.',
            schema: getNotionPageSchema,
            verboseParsingErrors: true
          }
        ),
        defineAgentTool<ReadNotionPageInput>(
          async (input) => {
            const runtime = await resolve()
            const page = await this.api.retrievePage(runtime, input.page_id)
            if (page.archived && !input.include_archived) {
              throw new NotionConnectorError('NOTION_NOT_FOUND', 'The requested Notion page is in trash.')
            }
            const blockResult = await readBlocks(this.api, runtime, input.page_id, input.max_depth, input.max_blocks)
            return {
              page,
              blocks: blockResult.blocks,
              markdown: blocksToMarkdown(blockResult.blocks),
              truncated: blockResult.truncated
            }
          },
          {
            name: 'notion_read_page',
            description:
              'Read one exact Notion page as a bounded recursive block tree and Markdown. Use after locating the page with notion_search.',
            schema: readNotionPageSchema,
            verboseParsingErrors: true
          }
        ),
        defineAgentTool<GetNotionDataSourceInput>(
          async (input) => {
            const runtime = await resolve()
            return this.api.retrieveDataSource(runtime, input.data_source_id)
          },
          {
            name: 'notion_get_data_source',
            description:
              'Get the schema and metadata of one exact Notion data source. Use its property names to construct a bounded query.',
            schema: getNotionDataSourceSchema,
            verboseParsingErrors: true
          }
        ),
        defineAgentTool<QueryNotionDataSourceInput>(
          async (input) => {
            const runtime = await resolve()
            const result = await this.api.queryDataSource(runtime, {
              dataSourceId: input.data_source_id,
              filter: input.filter,
              sorts: input.sorts,
              cursor: input.start_cursor,
              pageSize: input.page_size,
              filterProperties: input.filter_properties
            })
            return result
          },
          {
            name: 'notion_query_data_source',
            description:
              'Query one exact Notion data source with a strict filter, sort, and cursor. Pass filter as an object, never as JSON text. Results contain bounded page summaries and properties.',
            schema: queryNotionDataSourceSchema,
            verboseParsingErrors: true
          }
        )
      ]
    }
  }
}

async function resolveRuntime(
  options: RuntimeConfig,
  context: IAgentMiddlewareContext
): Promise<NotionRuntimeCredential> {
  if (options.provider && options.provider !== NOTION_CONNECTOR_PROVIDER) {
    throw new NotionConnectorError('CONNECTOR_UNAVAILABLE', `Unsupported connector provider '${options.provider}'.`)
  }
  if (!context.workspaceId)
    throw new NotionConnectorError('CONNECTOR_UNAVAILABLE', 'Notion tools require an active workspace.')
  const runtime = context.runtime.capabilities?.get(ConnectorRuntimeCapability)
  if (!runtime?.getConnectorCredential)
    throw new NotionConnectorError('CONNECTOR_UNAVAILABLE', 'Connector runtime capability is unavailable.')
  const value = await runtime.getConnectorCredential({
    workspaceId: context.workspaceId,
    provider: NOTION_CONNECTOR_PROVIDER,
    connectorId: options.connectorId
  })
  return readRuntimeCredential(value)
}

function readRuntimeCredential(value: ConnectorRuntimeCredentialV2): NotionRuntimeCredential {
  const accessToken = readString(value.credentials.accessToken)
  if (
    value.provider !== NOTION_CONNECTOR_PROVIDER ||
    value.authMethodId !== NOTION_PUBLIC_OAUTH_AUTH_METHOD ||
    !value.connectorId ||
    !accessToken
  ) {
    throw new NotionConnectorError('TOKEN_EXPIRED', 'Notion connector runtime credential is missing or invalid.')
  }
  return { connectorId: value.connectorId, accessToken }
}

type BlockBudget = { remaining: number; exhausted: boolean }
type ReadBlocksResult = { blocks: NotionBlock[]; truncated: boolean }

async function readBlocks(
  api: NotionApiClient,
  credential: NotionRuntimeCredential,
  blockId: string,
  maxDepth: number,
  maxBlocks: number,
  budget: BlockBudget = { remaining: maxBlocks, exhausted: false }
): Promise<ReadBlocksResult> {
  const result: NotionBlock[] = []
  let cursor: string | undefined
  do {
    if (budget.remaining <= 0) {
      budget.exhausted = true
      return { blocks: result, truncated: true }
    }
    const page = await api.listBlockChildren(credential, blockId, cursor, Math.min(100, budget.remaining))
    for (const raw of page.items) {
      if (budget.remaining <= 0) {
        budget.exhausted = true
        return { blocks: result, truncated: true }
      }
      budget.remaining -= 1
      const childResult =
        raw.hasChildren && maxDepth > 0
          ? await readBlocks(api, credential, raw.id, maxDepth - 1, maxBlocks, budget)
          : undefined
      const children = childResult?.blocks
      result.push(
        mapBlock(
          {
            id: raw.id,
            type: raw.type,
            has_children: raw.hasChildren,
            [raw.type]: { rich_text: raw.text ? [{ plain_text: raw.text }] : [] }
          },
          children
        )
      )
    }
    cursor = page.nextCursor
    if (!cursor && page.hasMore) budget.exhausted = true
  } while (cursor && budget.remaining > 0)
  return { blocks: result, truncated: budget.exhausted }
}
