import { BadRequestException, Injectable } from '@nestjs/common'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  OFFICE_CLI_AGENT_CAPABILITY,
  OFFICE_CLI_DOCUMENT_FORMATS,
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_GUIDANCE_SKILLS,
  OFFICE_CLI_ICON,
  OFFICE_CLI_MIDDLEWARE_NAME,
  OFFICE_CLI_RENDERING_CAPABILITY,
  OFFICE_CLI_VERSIONING_CAPABILITY,
  OFFICE_CLI_WORKBENCH_CAPABILITY,
  OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY
} from './constants.js'
import { OfficeCliService } from './office-cli.service.js'
import type { OfficeCliCommand, OfficeCliDocumentFormat, OfficeCliScope } from './types.js'

const documentIdSchema = z.object({
  documentId: z.string().uuid().optional()
    .describe('OfficeCLI document id. Defaults to the file selected in the OfficeCLI workbench.')
})
const createSchema = z.object({
  format: z.enum(OFFICE_CLI_DOCUMENT_FORMATS),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional()
})
const listSchema = z.object({
  search: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})
const commandSchema = z.enum([
  'view',
  'get',
  'query',
  'validate',
  'dump',
  'raw',
  'help',
  'set',
  'add',
  'import',
  'remove',
  'move',
  'swap',
  'raw-set',
  'add-part',
  'batch',
  'merge',
  'refresh'
])
const executeSchema = documentIdSchema.extend({
  command: commandSchema,
  args: z.array(z.string().max(1_000_000)).max(200).optional(),
  stdin: z.string().max(8_000_000).optional()
    .describe('Batch JSON or CSV/TSV content. Import must pass --stdin and provide the data here.'),
  expectedVersionNumber: z.number().int().min(1).optional(),
  changeSummary: z.string().max(1000).optional(),
  dangerousConfirmed: z.boolean().optional()
})
const restoreSchema = documentIdSchema.extend({
  versionId: z.string().uuid(),
  expectedVersionNumber: z.number().int().min(1).optional(),
  changeSummary: z.string().max(1000).optional()
})
const helpSchema = z.object({
  args: z.array(z.string().max(500)).max(12).optional()
})
const loadSkillSchema = z.object({
  name: z.enum(OFFICE_CLI_GUIDANCE_SKILLS)
})
const applyWordDesignSchema = documentIdSchema.extend({
  expectedVersionNumber: z.number().int().min(1),
  includeTableOfContents: z.boolean().optional().default(false),
  bodyFont: z.string().min(1).max(80).optional(),
  eastAsiaFont: z.string().min(1).max(80).optional(),
  accentColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/).optional(),
  changeSummary: z.string().max(1000).optional()
})
const officeCliRequestContextSchema = z.object({
  office_cli_workbench: z.object({
    documentId: z.string().uuid(),
    title: z.string().optional(),
    fileName: z.string().optional(),
    format: z.enum(OFFICE_CLI_DOCUMENT_FORMATS).optional(),
    versionNumber: z.number().int().min(1).optional(),
    elementPath: z.string().optional(),
    selectedText: z.string().max(500).optional()
  }).optional()
})

type OfficeCliRuntimeContext = z.infer<typeof officeCliRequestContextSchema>

@Injectable()
@AgentMiddlewareStrategy(OFFICE_CLI_MIDDLEWARE_NAME)
export class OfficeCliMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: OFFICE_CLI_MIDDLEWARE_NAME,
    label: {
      en_US: 'OfficeCLI',
      zh_Hans: 'OfficeCLI 原生 Office'
    },
    icon: {
      type: 'svg',
      value: OFFICE_CLI_ICON
    },
    description: {
      en_US: 'Create, inspect, render, edit, validate, version, and restore native DOCX, XLSX, and PPTX files with OfficeCLI.',
      zh_Hans: '使用 OfficeCLI 创建、检查、渲染、编辑、验证、版本化和恢复原生 DOCX、XLSX 与 PPTX 文件。'
    },
    features: [
      OFFICE_CLI_FEATURE,
      OFFICE_CLI_WORKBENCH_CAPABILITY,
      OFFICE_CLI_AGENT_CAPABILITY,
      OFFICE_CLI_RENDERING_CAPABILITY,
      OFFICE_CLI_VERSIONING_CAPABILITY
    ],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: OfficeCliService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: OFFICE_CLI_MIDDLEWARE_NAME,
      contextSchema: officeCliRequestContextSchema,
      tools: [
        tool(
          async (input) => {
            const result = await this.service.createDocument(scope, {
              format: input.format as OfficeCliDocumentFormat,
              title: input.title,
              description: input.description
            })
            return artifactResult(result, `Created ${result.document.fileName}`)
          },
          {
            name: 'officecli_create_document',
            description: 'Create a native DOCX, XLSX, or PPTX file with OfficeCLI and return version 1 as a Workspace File artifact.',
            schema: createSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getWorkbenchData(scope, input), null, 2),
          {
            name: 'officecli_list_documents',
            description: 'List OfficeCLI documents available in the current Agent or project workspace.',
            schema: listSchema
          }
        ),
        tool(
          async (input, config) => JSON.stringify(
            await this.service.readDocument(scope, resolveDocumentId(input.documentId, config)),
            null,
            2
          ),
          {
            name: 'officecli_read_document',
            description: 'Read the current OfficeCLI document structure before editing it. Defaults to the file selected in the OfficeCLI workbench.',
            schema: documentIdSchema
          }
        ),
        tool(
          async (input, config) => {
            const documentId = resolveDocumentId(input.documentId, config)
            const result = await this.service.executeCommand(scope, {
              documentId,
              command: input.command as OfficeCliCommand,
              args: input.args,
              stdin: input.stdin,
              expectedVersionNumber: input.expectedVersionNumber,
              changeSummary: input.changeSummary,
              dangerousConfirmed: input.dangerousConfirmed,
              source: 'agent'
            })
            return result.mutated
              ? artifactResult(result, `OfficeCLI ${input.command} created version ${result.version.versionNumber}`)
              : [JSON.stringify(result, null, 2), { files: [] }]
          },
          {
            name: 'officecli_execute',
            description: 'Run a supported OfficeCLI document command on the selected workbench file by default. Read first, use exact element paths, pass expectedVersionNumber for writes, and explicitly confirm raw-set/add-part.',
            schema: executeSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input, config) => JSON.stringify(
            await this.service.listVersions(scope, resolveDocumentId(input.documentId, config)),
            null,
            2
          ),
          {
            name: 'officecli_get_versions',
            description: 'List immutable OfficeCLI file versions. Defaults to the file selected in the OfficeCLI workbench.',
            schema: documentIdSchema
          }
        ),
        tool(
          async (input, config) => {
            const result = await this.service.restoreVersion(scope, {
              ...input,
              documentId: resolveDocumentId(input.documentId, config)
            })
            return artifactResult(result, `Restored OfficeCLI version ${input.versionId}`)
          },
          {
            name: 'officecli_restore_version',
            description: 'Restore an immutable OfficeCLI file version as a new current version. Defaults to the selected workbench file.',
            schema: restoreSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input, config) => {
            const file = await this.service.getFile(scope, resolveDocumentId(input.documentId, config))
            return [
              JSON.stringify(file, null, 2),
              { files: [file] }
            ]
          },
          {
            name: 'officecli_get_file',
            description: 'Return the selected native OfficeCLI document as a downloadable Workspace File artifact.',
            schema: documentIdSchema,
            responseFormat: 'content_and_artifact'
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.help(input.args), null, 2),
          {
            name: 'officecli_help',
            description: 'Read OfficeCLI built-in help instead of guessing element types, properties, or command syntax.',
            schema: helpSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.loadSkill(input.name), null, 2),
          {
            name: 'officecli_load_skill',
            description: 'Load the pinned OfficeCLI professional guidance for Word, Excel, PowerPoint, financial models, dashboards, academic papers, pitch decks, or animated decks. Call this before creating or substantially reformatting a non-trivial Office artifact, then translate its CLI examples into officecli_execute calls without using shell paths.',
            schema: loadSkillSchema
          }
        ),
        tool(
          async (input, config) => {
            const result = await this.service.applyWordDesign(scope, {
              ...input,
              documentId: resolveDocumentId(input.documentId, config)
            })
            return artifactResult(result, 'Applied professional Word styles and document structure')
          },
          {
            name: 'officecli_apply_word_design',
            description: 'Create or update real DOCX Title, Subtitle, Heading1, Heading2, Heading3, and Normal style definitions; repair legacy heading references; optionally insert a clickable table of contents; validate; and return the formatted native Word file. Use before or after writing substantial Word content so exported headings remain visually distinct.',
            schema: applyWordDesignSchema,
            responseFormat: 'content_and_artifact'
          }
        )
      ],
      wrapModelCall: (request, handler) => {
        const selected = readWorkbenchRuntimeContext(request.runtime).office_cli_workbench
        return handler({
          ...request,
          systemMessage: appendSystemMessage(
            request.systemMessage,
            [
              buildProfessionalOfficeSystemPrompt(selected?.format),
              selected?.documentId ? buildWorkbenchSystemPrompt(selected) : null
            ].filter(Boolean).join('\n\n')
          )
        })
      }
    }
  }
}

function artifactResult(
  result: object & {
    file?: {
      fileName: string
      filePath: string
      fileUrl: string
      mimeType: string
      extension: string
    }
  },
  message: string
) {
  return [
    JSON.stringify({ message, ...result }, null, 2),
    { files: result.file ? [result.file] : [] }
  ]
}

function scopeFromContext(context: IAgentMiddlewareContext): OfficeCliScope {
  const projectId = context.projectId ?? null
  const xpertId = context.xpertId ?? null
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined
      ? RequestContext.getOrganizationId()
      : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId,
    userId: context.userId,
    assistantId: xpertId,
    conversationId: context.conversationId ?? null,
    runtimeWorkspaceFiles: context.runtime?.capabilities?.get(OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY),
    workspaceFiles: projectId
      ? { catalog: 'projects', scopeId: projectId, projectId, userId: context.userId, isolateByUser: false }
      : xpertId
        ? {
            catalog: context.workspaceDataScope === 'user' ? 'user-xperts' : 'xperts',
            scopeId: xpertId,
            xpertId,
            userId: context.userId,
            isolateByUser: context.workspaceDataScope === 'user'
          }
        : undefined
  }
}

function resolveDocumentId(documentId: string | undefined, config: unknown) {
  if (documentId) {
    return documentId
  }
  const runtimeContext = readWorkbenchRuntimeContext(config)
  const selectedDocumentId = runtimeContext.office_cli_workbench?.documentId
  if (!selectedDocumentId) {
    throw new BadRequestException(
      'No OfficeCLI document is selected. Select a file in the OfficeCLI workbench or provide documentId.'
    )
  }
  return selectedDocumentId
}

function readWorkbenchRuntimeContext(config: unknown): OfficeCliRuntimeContext {
  const runtimeConfig = config as
    | {
        context?: Record<string, unknown>
        configurable?: {
          context?: Record<string, unknown>
        }
      }
    | undefined

  const context =
    runtimeConfig?.context && typeof runtimeConfig.context === 'object'
      ? runtimeConfig.context
      : runtimeConfig?.configurable?.context && typeof runtimeConfig.configurable.context === 'object'
        ? runtimeConfig.configurable.context
        : {}

  const parsed = officeCliRequestContextSchema.safeParse(context)
  return parsed.success ? parsed.data : {}
}

function appendSystemMessage(systemMessage: unknown, addition: string) {
  const content =
    typeof systemMessage === 'string'
      ? systemMessage
      : systemMessage instanceof SystemMessage && typeof systemMessage.content === 'string'
        ? systemMessage.content
        : isRecord(systemMessage) && typeof systemMessage['content'] === 'string'
          ? systemMessage['content']
          : ''
  return new SystemMessage([content, addition].filter(Boolean).join('\n\n'))
}

function buildWorkbenchSystemPrompt(
  selected: NonNullable<OfficeCliRuntimeContext['office_cli_workbench']>
) {
  return [
    'Current OfficeCLI Workbench context:',
    `- documentId: ${selected.documentId}`,
    selected.title ? `- title: ${selected.title}` : null,
    selected.fileName ? `- fileName: ${selected.fileName}` : null,
    selected.format ? `- format: ${selected.format}` : null,
    selected.versionNumber !== undefined ? `- currentVersionNumber: ${selected.versionNumber}` : null,
    selected.elementPath ? `- selectedElementPath: ${selected.elementPath}` : null,
    selected.selectedText ? `- selectedText: ${JSON.stringify(selected.selectedText)}` : null,
    'OfficeCLI tools may omit documentId when operating on this selected Workbench file.',
    selected.elementPath
      ? 'When the user refers to the selected content or element, use selectedElementPath as the exact OfficeCLI target.'
      : null
  ].filter(Boolean).join('\n')
}

function buildProfessionalOfficeSystemPrompt(format?: 'docx' | 'xlsx' | 'pptx') {
  const recommendedSkill =
    format === 'docx' ? 'word'
      : format === 'xlsx' ? 'excel'
        : format === 'pptx' ? 'pptx'
          : null
  return [
    'Office artifact quality requirements:',
    '- A successful command is not the same as a finished deliverable. Structure, formatting, and visual QA are required.',
    recommendedSkill
      ? `- Before substantial creation or reformatting, call officecli_load_skill with name=${recommendedSkill}.`
      : '- Before substantial creation, call officecli_load_skill for the selected Word, Excel, or PowerPoint workflow.',
    '- Word: define real reusable styles before applying Title/Heading1/Heading2/Heading3; use officecli_apply_word_design instead of merely assigning missing style names. Add a TOC when the user requests one or the document needs navigation.',
    '- Excel: use formulas for derived values, explicit number formats and column widths, styled headers/tables, and validate charts or conditional formatting visually.',
    '- PowerPoint: use an explicit theme and text hierarchy, meaningful layouts and visuals, speaker notes, and check every slide for clipping or overflow.',
    '- Before delivery, run validate and view issues, inspect the native HTML preview, fix material problems, and return the latest workspace file.'
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
