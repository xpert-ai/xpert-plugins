import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataSource,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  INVOICE_REIMBURSEMENT_FEATURE,
  INVOICE_REIMBURSEMENT_PLUGIN_NAME,
  INVOICE_REIMBURSEMENT_PROVIDER_KEY,
  INVOICE_REIMBURSEMENT_REMOTE_ENTRY_KEY,
  INVOICE_REIMBURSEMENT_VIEW_KEY
} from './constants.js'
import { InvoiceReimbursementService } from './invoice-reimbursement.service.js'
import type { CreateInvoiceRecordDto, ParseInvoiceInput } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

async function readPackageFile(packageName: string, relativePath: string) {
  try {
    const entry = requireFromHere.resolve(`${packageName}/package.json`)
    return await readFile(join(dirname(entry), relativePath), 'utf8')
  } catch {
    return ''
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: {
      isolation: 'iframe',
      entry: INVOICE_REIMBURSEMENT_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform'
    }
  }
}

function platformDataSource(): XpertViewDataSource {
  return {
    mode: 'platform',
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsSort: true,
      supportsFilter: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

@Injectable()
@ViewExtensionProvider(INVOICE_REIMBURSEMENT_PROVIDER_KEY)
export class InvoiceReimbursementViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: InvoiceReimbursementService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [INVOICE_REIMBURSEMENT_FEATURE]
          },
          workbench: {
            fixed: true
          }
        }
      : {}

    return [
      {
        key: INVOICE_REIMBURSEMENT_VIEW_KEY,
        title: text('Invoice Reimbursement Workbench', '发票报销预审工作台'),
        description: text(
          'AI-assisted invoice parsing, tax compliance check, and reimbursement ledger review.',
          '发票智能解析、税号与品目合规自检、报销台账人机在环核验工作台。'
        ),
        icon: {
          type: 'font',
          value: 'ri-file-list-3-line',
          color: '#2563eb'
        },
        hostType: 'agent',
        slot,
        order: 10,
        refreshable: true,
        ...base,
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Invoice Reimbursement', '发票报销'),
                  order: 10,
                  icon: {
                    type: 'font',
                    value: 'ri-file-list-3-line',
                    color: '#2563eb'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: INVOICE_REIMBURSEMENT_PROVIDER_KEY,
          plugin: INVOICE_REIMBURSEMENT_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource()
      }
    ]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== INVOICE_REIMBURSEMENT_VIEW_KEY) {
      return {}
    }
    const tenantId = context.tenantId || 'default'
    const organizationId = context.organizationId || 'default'
    const records = await this.service.listInvoiceRecords(tenantId, organizationId)
    return {
      items: records,
      total: records.length
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== INVOICE_REIMBURSEMENT_VIEW_KEY) {
      return { success: false, message: text('Unsupported view', '不支持的视图') }
    }
    const tenantId = context.tenantId || 'default'
    const organizationId = context.organizationId || 'default'

    try {
      if (actionKey === 'parse_invoice') {
        const input = request.input as unknown as ParseInvoiceInput
        const parsed = this.service.parseInvoiceText(input)
        return {
          success: parsed.success,
          message: parsed.success ? text('Parse success', '解析成功') : text('Parse failed', parsed.error || '解析失败'),
          data: parsed.data
        }
      }

      if (actionKey === 'save_invoice') {
        const dto = request.input as unknown as CreateInvoiceRecordDto
        const record = await this.service.createInvoiceRecord(dto, tenantId, organizationId)
        return {
          success: true,
          message: text('Invoice saved', '发票已成功保存归档'),
          refresh: true,
          data: record
        }
      }

      return {
        success: false,
        message: text('Unknown action', `未知操作: ${actionKey}`)
      }
    } catch (err: any) {
      return {
        success: false,
        message: text('Action error', err.message || '操作执行失败')
      }
    }
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (component.entry !== INVOICE_REIMBURSEMENT_REMOTE_ENTRY_KEY || viewKey !== INVOICE_REIMBURSEMENT_VIEW_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported invoice component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', INVOICE_REIMBURSEMENT_REMOTE_ENTRY_KEY, 'app.js')
    let appScript = ''
    try {
      appScript = await readFile(appPath, 'utf8')
    } catch {
      appScript = 'console.log("Invoice reimbursement remote component loaded.");'
    }

    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Invoice Reimbursement Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }
}
