import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  PROCUREMENT_ICON,
  PROCUREMENT_QUOTE_COMPARISON_FEATURE,
  PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME,
  PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY,
  PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY,
  PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { ProcurementQuoteComparisonService } from './procurement-quote-comparison.service.js'
import type { ProcurementDocumentExtractionStatus, ProcurementDocumentRole, ProcurementScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const MAX_EXTRACTED_CONTENT_LENGTH = 60000
const TOOL_NAMES = [
  'procurement_save_requirement',
  'procurement_save_supplier_quote',
  'procurement_save_item_matches',
  'procurement_save_risk_items',
  'procurement_finalize_recommendation',
  'procurement_report_parse_failure'
]

@Injectable()
@ViewExtensionProvider(PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY)
export class ProcurementQuoteComparisonViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ProcurementQuoteComparisonService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
        title: text('Procurement Quote Comparison', '采购比价助手'),
        description: text(
          'Create procurement comparison cases, upload requirement and supplier quote documents, and review AI comparison results.',
          '创建采购比价项目，上传采购需求和供应商报价，审核 AI 横向比价结果。'
        ),
        icon: {
          type: 'font',
          value: 'ri-scales-3-line'
        },
        hostType: context.hostType,
        slot,
        order: 30,
        refreshable: true,
        activation: {
          requiredFeatures: [PROCUREMENT_QUOTE_COMPARISON_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Procurement Quote Comparison', '采购比价助手'),
                  order: 30,
                  icon: {
                    type: 'svg',
                    value: PROCUREMENT_ICON,
                    alt: 'Procurement Quote Comparison'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY,
          plugin: PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'procurement-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'create_comparison_case',
            label: text('New Procurement Project', '新建采购项目'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'create_case_from_requirement_file',
            label: text('Upload Requirement to Create Project', '上传采购需求单创建项目'),
            icon: 'ri-upload-cloud-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'upload_requirement_file',
            label: text('Upload Requirement', '上传采购需求单'),
            icon: 'ri-upload-cloud-2-line',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'upload_supplier_quote_file',
            label: text('Upload Supplier Quote', '上传供应商报价单'),
            icon: 'ri-upload-cloud-2-line',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'start_requirement_parse',
            label: text('Parse Requirement', '解析采购需求'),
            icon: 'ri-file-search-line',
            actionType: 'invoke'
          },
          {
            key: 'start_supplier_quote_parse_batch',
            label: text('Parse Quote Batch', '批量解析报价单'),
            icon: 'ri-stack-line',
            actionType: 'invoke'
          },
          {
            key: 'one_click_parse_all',
            label: text('Parse All', '一键解析全部'),
            icon: 'ri-flashlight-line',
            actionType: 'invoke'
          },
          {
            key: 'generate_comparison_result',
            label: text('Generate Comparison', '生成比价结果'),
            icon: 'ri-scales-3-line',
            actionType: 'invoke'
          },
          {
            key: 'delete_comparison_case',
            label: text('Delete Procurement Project', '删除采购项目'),
            icon: 'ri-delete-bin-line',
            actionType: 'invoke'
          },
          {
            key: 'mark_parse_message_dispatched',
            label: text('Mark Parse Message Dispatched', '标记解析消息已派发'),
            actionType: 'invoke'
          },
          {
            key: 'update_manual_fields',
            label: text('Update Manual Fields', '更新人工修正字段'),
            icon: 'ri-edit-line',
            actionType: 'invoke'
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY || component.entry !== PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', PROCUREMENT_QUOTE_COMPARISON_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Procurement Quote Comparison',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY) {
      return {}
    }

    return this.service.getWorkbenchData(scopeFromContext(context), {
      caseId: getStringParameter(query.parameters, 'caseId') ?? query.selectionId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Procurement view refreshed', '采购比价视图已刷新')
      }

      if (actionKey === 'create_comparison_case') {
        const result = await this.service.createComparisonCase(scope, {
          title: requireStringInput(request.input, 'title', 'Project title is required.'),
          purchaseNo: requireStringInput(request.input, 'purchaseNo', 'Purchase number is required.'),
          applicant: getStringInput(request.input, 'applicant'),
          department: getStringInput(request.input, 'department'),
          budgetAmount: getStringInput(request.input, 'budgetAmount'),
          expectedDeliveryDate: getStringInput(request.input, 'expectedDeliveryDate'),
          description: getStringInput(request.input, 'description'),
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return {
          ...success('Procurement project created', '采购项目已创建'),
          data: result
        }
      }

      if (actionKey === 'start_requirement_parse') {
        const result = await this.service.prepareRequirementParseChatMessage(scope, {
          caseId: requireCaseId(request),
          xpertId: requireActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return {
          ...success('Requirement parsing started', '采购需求解析已启动'),
          data: result,
          refresh: false
        }
      }

      if (actionKey === 'start_supplier_quote_parse_batch') {
        const result = await this.service.prepareSupplierQuoteParseMessages(scope, {
          caseId: requireCaseId(request),
          xpertId: requireActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey'),
          maxConcurrency: getNumberInput(request.input, 'maxConcurrency')
        })
        return {
          ...success('Supplier quote parsing started', '供应商报价批量解析已启动'),
          data: result,
          refresh: false
        }
      }

      if (actionKey === 'one_click_parse_all') {
        const parseInput = {
          caseId: requireCaseId(request),
          xpertId: requireActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey'),
          maxConcurrency: getNumberInput(request.input, 'maxConcurrency')
        }
        const requirementCommand = await this.service.prepareRequirementParseChatMessage(scope, parseInput)
        const quoteBatch = await this.service.prepareSupplierQuoteParseMessages(scope, parseInput)
        return {
          ...success('Procurement parsing started', '采购材料解析已启动'),
          data: {
            messages: [requirementCommand, ...quoteBatch.messages],
            requirementCommand,
            quoteBatch
          },
          refresh: false
        }
      }

      if (actionKey === 'generate_comparison_result') {
        const caseId = requireCaseId(request)
        return {
          ...success('Comparison request prepared', '比价生成请求已准备'),
          data: {
            caseId,
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildComparisonPrompt(caseId)
            },
            role: 'comparison'
          },
          refresh: false
        }
      }

      if (actionKey === 'delete_comparison_case') {
        const caseId = requireCaseId(request)
        const result = await this.service.deleteComparisonCase(scope, caseId)
        return {
          ...success('Procurement project deleted', '采购项目已删除'),
          data: result
        }
      }

      if (actionKey === 'mark_parse_message_dispatched') {
        const result = await this.service.markParseMessageDispatched(scope, {
          caseId: requireCaseId(request),
          parseJobId: requireStringInput(request.input, 'parseJobId', 'Parse job id is required.'),
          clientMessageId: getStringInput(request.input, 'clientMessageId'),
          conversationId: getStringInput(request.input, 'conversationId'),
          threadId: getStringInput(request.input, 'threadId')
        })
        return {
          ...success('Parse message dispatched', '解析消息已派发'),
          data: result,
          refresh: false
        }
      }

      if (actionKey === 'update_manual_fields') {
        const caseId = requireCaseId(request)
        const result = await this.service.saveRequirementExtraction(scope, {
          caseId,
          project: {
            title: getStringInput(request.input, 'title'),
            purchaseNo: getStringInput(request.input, 'purchaseNo'),
            applicant: getStringInput(request.input, 'applicant'),
            department: getStringInput(request.input, 'department'),
            budgetAmount: getStringInput(request.input, 'budgetAmount'),
            expectedDeliveryDate: getStringInput(request.input, 'expectedDeliveryDate'),
            description: getStringInput(request.input, 'description')
          },
          items: []
        })
        return {
          ...success('Manual fields updated', '人工修正字段已更新'),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      if (actionKey === 'create_case_from_requirement_file') {
        const fileName = getFileDisplayName(file, request.input, 'uploaded-requirement')
        const fileHandle = readPlatformFileHandle(file)
        const extractedContent = hasPlatformFileHandle(fileHandle) ? {} : extractViewActionFileContent(file, fileName)
        const result = await this.service.createCaseFromRequirementDocument(scopeFromContext(context), {
          name: fileName,
          fileAssetId: getStringInput(request.input, 'fileAssetId') ?? fileHandle.fileAssetId,
          fileId: getStringInput(request.input, 'fileId') ?? fileHandle.fileId,
          storageFileId: getStringInput(request.input, 'storageFileId') ?? fileHandle.storageFileId,
          mimeType: file.mimetype ?? getStringInput(request.input, 'mimeType'),
          size: file.size,
          extractedContent: extractedContent.extractedContent,
          extractionStatus: extractedContent.extractionStatus,
          extractionErrorMessage: extractedContent.extractionErrorMessage,
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })

        return {
          ...success('Procurement project created from requirement', '已根据采购需求单创建项目'),
          data: result
        }
      }

      const role = actionKey === 'upload_requirement_file' ? 'requirement' : actionKey === 'upload_supplier_quote_file' ? 'supplier_quote' : null
      if (!role) {
        return failure('Unsupported file action', '不支持的文件操作')
      }

      const fileName = getFileDisplayName(file, request.input, 'uploaded-document')
      const fileHandle = readPlatformFileHandle(file)
      const extractedContent = hasPlatformFileHandle(fileHandle) ? {} : extractViewActionFileContent(file, fileName)
      const result = await this.service.registerSourceDocument(scopeFromContext(context), {
        caseId: requireCaseId(request),
        role,
        supplierName: getStringInput(request.input, 'supplierName'),
        name: fileName,
        fileAssetId: getStringInput(request.input, 'fileAssetId') ?? fileHandle.fileAssetId,
        fileId: getStringInput(request.input, 'fileId') ?? fileHandle.fileId,
        storageFileId: getStringInput(request.input, 'storageFileId') ?? fileHandle.storageFileId,
        mimeType: file.mimetype ?? getStringInput(request.input, 'mimeType'),
        size: file.size,
        extractedContent: extractedContent.extractedContent,
        extractionStatus: extractedContent.extractionStatus,
        extractionErrorMessage: extractedContent.extractionErrorMessage
      })

      return {
        ...success('Source document uploaded', '来源文件已登记'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'File action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'project') {
    return slot === PROJECT_DETAIL_SECTIONS_SLOT
  }

  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }

  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): ProcurementScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    userId: context.userId
  }
}

function getActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'xpertId') ?? (context.hostType === 'agent' ? context.hostId : undefined)
}

function requireActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return requireString(getActionXpertId(context, input), 'Procurement Xpert is required.')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function requireCaseId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'caseId') ??
    getStringParameter(request.parameters, 'caseId') ??
    requireString(request.targetId, 'Procurement case id is required.')
  )
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  return requireString(getStringInput(input, key), message)
}

function requireString(value: string | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getFileDisplayName(
  file: XpertViewFileActionFile,
  input: XpertViewActionRequest['input'],
  fallback: string
) {
  return repairUtf8Mojibake(getStringInput(input, 'name') ?? file.originalname ?? fallback)
}

function readPlatformFileHandle(file: XpertViewFileActionFile) {
  const fileAssetId = readFileStringProperty(file, 'fileAssetId')
  const fileId = readFileStringProperty(file, 'fileId')
  const storageFileId = readFileStringProperty(file, 'storageFileId')
  return {
    fileAssetId,
    fileId,
    storageFileId
  }
}

function readFileStringProperty(
  file: XpertViewFileActionFile,
  key: 'fileAssetId' | 'fileId' | 'storageFileId'
) {
  if (key === 'fileAssetId' && 'fileAssetId' in file && typeof file.fileAssetId === 'string') {
    return normalizeOptionalString(file.fileAssetId)
  }
  if (key === 'fileId' && 'fileId' in file && typeof file.fileId === 'string') {
    return normalizeOptionalString(file.fileId)
  }
  if (key === 'storageFileId' && 'storageFileId' in file && typeof file.storageFileId === 'string') {
    return normalizeOptionalString(file.storageFileId)
  }
  return undefined
}

function hasPlatformFileHandle(fileHandle: ReturnType<typeof readPlatformFileHandle>) {
  return Boolean(fileHandle.fileAssetId || fileHandle.fileId || fileHandle.storageFileId)
}

function extractViewActionFileContent(
  file: XpertViewFileActionFile,
  fileName: string
): {
  extractedContent?: string
  extractionStatus?: ProcurementDocumentExtractionStatus
  extractionErrorMessage?: string
} {
  const extension = extname(fileName).toLowerCase()
  const mimeType = normalizeOptionalString(file.mimetype)?.toLowerCase() ?? ''

  try {
    if (isSpreadsheetFile(extension, mimeType)) {
      return normalizeExtractedContent(extractSpreadsheetText(file.buffer), 'Spreadsheet file contains no readable content.')
    }

    if (isTextFile(extension, mimeType)) {
      return normalizeExtractedContent(file.buffer.toString('utf8'), 'Text file contains no readable content.')
    }

    return {
      extractionStatus: 'unsupported',
      extractionErrorMessage: 'Unsupported file type for plugin text extraction.'
    }
  } catch (error) {
    return {
      extractionStatus: 'failed',
      extractionErrorMessage: getActionErrorMessage(error, 'Failed to extract uploaded file content.')
    }
  }
}

function isSpreadsheetFile(extension: string, mimeType: string) {
  return (
    extension === '.xlsx' ||
    extension === '.xls' ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('ms-excel')
  )
}

function isTextFile(extension: string, mimeType: string) {
  return (
    extension === '.csv' ||
    extension === '.tsv' ||
    extension === '.txt' ||
    extension === '.md' ||
    mimeType.startsWith('text/')
  )
}

function extractSpreadsheetText(buffer: Buffer) {
  const workbook: XLSX.WorkBook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
    codepage: 65001
  })

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      return ''
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false
    })
    const tableText = rows
      .map((row) => row.map(formatExtractedCell).join('\t').trim())
      .filter((row) => row.length > 0)
      .join('\n')

    return tableText ? `【工作表：${sheetName}】\n${tableText}` : ''
  })
    .filter((section) => section.length > 0)
    .join('\n\n')
}

function formatExtractedCell(value: unknown) {
  if (value == null) {
    return ''
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return String(value)
}

function normalizeExtractedContent(content: string, emptyMessage: string) {
  const normalized = content.trim()
  if (!normalized) {
    return {
      extractionStatus: 'failed' as const,
      extractionErrorMessage: emptyMessage
    }
  }

  return {
    extractedContent:
      normalized.length > MAX_EXTRACTED_CONTENT_LENGTH
        ? `${normalized.slice(0, MAX_EXTRACTED_CONTENT_LENGTH)}\n...内容过长，已截断。`
        : normalized,
    extractionStatus: 'extracted' as const
  }
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function repairUtf8Mojibake(value: string) {
  if (!looksLikeUtf8Mojibake(value)) {
    return value
  }

  const repaired = Buffer.from(value, 'latin1').toString('utf8')
  return repaired.includes('\uFFFD') ? value : repaired
}

function looksLikeUtf8Mojibake(value: string) {
  return /[ÃÂ][\x80-\xBF]?|[äåæçèéêëìíîïðñòóôõöøùúûüýþ][\x80-\xBF]/i.test(value)
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getStringParameter(
  parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'] | undefined,
  key: string
) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function buildComparisonPrompt(caseId: string) {
  return [
    `Please generate the procurement comparison result for caseId ${caseId}.`,
    'Use saved requirement items and supplier quotes.',
    'Call procurement_save_item_matches, procurement_save_risk_items, and procurement_finalize_recommendation.',
    'Explain why the recommended supplier is selected, including non-price risks and delivery or warranty factors.'
  ].join('\n')
}
