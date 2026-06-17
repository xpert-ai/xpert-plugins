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
  TRADE_COMPLIANCE_FEATURE,
  TRADE_COMPLIANCE_ICON,
  TRADE_COMPLIANCE_PLUGIN_NAME,
  TRADE_COMPLIANCE_PROVIDER_KEY,
  TRADE_COMPLIANCE_REMOTE_ENTRY_KEY,
  TRADE_COMPLIANCE_VIEW_KEY
} from './constants.js'
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js'
import type { TradeComplianceScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(TRADE_COMPLIANCE_PROVIDER_KEY)
export class TradeComplianceWorkbenchViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TradeComplianceWorkbenchService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }

    return [
      {
        key: TRADE_COMPLIANCE_VIEW_KEY,
        title: text('Trade Compliance Workbench', '外贸合规工作台'),
        description: text(
          'Manage controlled goods, supplier products, and generated customs workbooks.',
          '管理管控商品、供应商商品和生成的报关资料。'
        ),
        icon: {
          type: 'svg',
          value: TRADE_COMPLIANCE_ICON
        },
        hostType: 'agent',
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [TRADE_COMPLIANCE_FEATURE]
        },
        source: {
          provider: TRADE_COMPLIANCE_PROVIDER_KEY,
          plugin: TRADE_COMPLIANCE_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: TRADE_COMPLIANCE_REMOTE_ENTRY_KEY
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
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'upload_controlled_goods_file',
            label: text('Upload Controlled Goods File', '上传管控商品文件'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'upload_supplier_contract',
            label: text('Upload Supplier Contract', '上传供应商合同'),
            icon: 'ri-file-list-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'upload_sales_contract',
            label: text('Upload Sales Contract', '上传购销合同'),
            icon: 'ri-file-excel-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          { key: 'confirm_review_item', label: text('Confirm Item', '确认单条'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'confirm_review_items', label: text('Confirm Selected', '批量确认'), icon: 'ri-check-double-line', actionType: 'invoke' },
          { key: 'generate_customs_workbook', label: text('Generate Workbook', '生成报关资料'), icon: 'ri-file-excel-line', actionType: 'invoke' }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== TRADE_COMPLIANCE_VIEW_KEY || component.entry !== TRADE_COMPLIANCE_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported trade compliance component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(join(__dirname, 'remote-components', TRADE_COMPLIANCE_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Trade Compliance Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    _viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    const scope = scopeFromContext(context)
    const [reviewItems, controlledGoods, products, workbookGenerations] = await Promise.all([
      this.service.listReviewItems(scope),
      this.service.listControlledGoods(scope),
      this.service.listProducts(scope),
      this.service.listWorkbookGenerations(scope)
    ])
    return {
      items: reviewItems,
      total: reviewItems.length,
      summary: {
        reviewItems,
        controlledGoods,
        products,
        workbookGenerations
      }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    _viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    const scope = scopeFromContext(context)
    if (actionKey === 'confirm_review_item') {
      const itemId = readString(request.input, 'itemId')
      if (!itemId) {
        return failure('itemId is required', '缺少 itemId')
      }
      return success(await this.service.confirmReviewItem(scope, itemId, readRecord(request.input, 'confirmedData')))
    }
    if (actionKey === 'confirm_review_items') {
      const itemIds = readStringArray(request.input, 'itemIds')
      return success(await this.service.confirmReviewItems(scope, itemIds))
    }
    if (actionKey === 'refresh') {
      return { success: true, message: text('Refreshed', '已刷新'), refresh: true }
    }
    return {
      success: true,
      message: text('Action accepted', '操作已接收'),
      refresh: true
    }
  }
}

async function readPackageFile(packageName: string, filePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, filePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): TradeComplianceScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId ?? null,
    assistantId: context.hostType === 'agent' ? context.hostId : null,
    userId: context.userId
  }
}

function success(data: unknown): XpertViewActionResult {
  return {
    success: true,
    message: text('Saved', '已保存'),
    data,
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans),
    refresh: false
  }
}

function readString(input: unknown, key: string) {
  return typeof input === 'object' && input != null && typeof Reflect.get(input, key) === 'string'
    ? String(Reflect.get(input, key))
    : undefined
}

function readRecord(input: unknown, key: string) {
  const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined
  return typeof value === 'object' && value != null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readStringArray(input: unknown, key: string) {
  const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
