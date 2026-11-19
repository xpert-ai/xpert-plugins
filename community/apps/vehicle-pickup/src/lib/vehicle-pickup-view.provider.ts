import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  VEHICLE_PICKUP_FEATURE,
  VEHICLE_PICKUP_ICON,
  VEHICLE_PICKUP_MIDDLEWARE_TOOL_NAMES,
  VEHICLE_PICKUP_PLUGIN_NAME,
  VEHICLE_PICKUP_PROVIDER_KEY,
  VEHICLE_PICKUP_REMOTE_ENTRY_KEY,
  VEHICLE_PICKUP_VIEW_KEY
} from './constants'
import { VehiclePickupService } from './vehicle-pickup.service'
import type { VehiclePickupRole, VehiclePickupStatus } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(VEHICLE_PICKUP_PROVIDER_KEY)
export class VehiclePickupViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: VehiclePickupService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [VEHICLE_PICKUP_FEATURE]
          },
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              label: text('Vehicle Pickup', '车辆自提'),
              order: 24,
              icon: {
                type: 'svg' as const,
                value: VEHICLE_PICKUP_ICON,
                color: '#1f6f5f'
              }
            }
          }
        }
      : {}

    return [
      {
        key: VEHICLE_PICKUP_VIEW_KEY,
        title: text('Vehicle Pickup Workbench', '车辆自提工作台'),
        description: text(
          'Review pickup requests, vehicle eligibility, approvals and mock carrier execution.',
          '查看自提申请、车辆可提状态、审批结果和模拟运输执行。'
        ),
        icon: {
          type: 'svg',
          value: VEHICLE_PICKUP_ICON,
          color: '#1f6f5f'
        },
        hostType: 'agent',
        slot,
        order: 24,
        refreshable: true,
        ...base,
        source: {
          provider: VEHICLE_PICKUP_PROVIDER_KEY,
          plugin: VEHICLE_PICKUP_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'approve',
            label: text('Approve', '通过'),
            icon: 'ri-check-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'reject',
            label: text('Reject', '驳回'),
            icon: 'ri-close-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'cancel',
            label: text('Cancel Request', '取消申请'),
            icon: 'ri-forbid-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'execute',
            label: text('Mock Execute', '模拟执行'),
            icon: 'ri-truck-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'simulate_vehicle_issue',
            label: text('Simulate Vehicle Issue', '模拟车辆状态'),
            icon: 'ri-test-tube-line',
            placement: 'toolbar',
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
    if (viewKey !== VEHICLE_PICKUP_VIEW_KEY || component.entry !== VEHICLE_PICKUP_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported vehicle pickup component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const remoteRoot = join(__dirname, 'remote-components', VEHICLE_PICKUP_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(remoteRoot, 'app.js'), 'utf8')
    const appCss = await readFile(join(remoteRoot, 'app.css'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Vehicle Pickup Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== VEHICLE_PICKUP_VIEW_KEY) return {}
    const role = getStringParameter(query.parameters, 'role') as VehiclePickupRole | undefined
    const actor = this.service.resolveActor(context.userId, context.tenantId, context.organizationId, role)
    return this.service.getViewData(actor, {
      role,
      status: getStringParameter(query.parameters, 'status') as VehiclePickupStatus | undefined,
      requestId: getStringParameter(query.parameters, 'requestId'),
      requestNo: getStringParameter(query.parameters, 'requestNo'),
      keyword: query.search || getStringParameter(query.parameters, 'keyword')
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== VEHICLE_PICKUP_VIEW_KEY) return failure('Unsupported action', '不支持的操作')
    try {
      const requestedRole = getStringInput(request.input, 'role') as VehiclePickupRole | undefined
      const actor = this.service.resolveActor(
        context.userId,
        context.tenantId,
        context.organizationId,
        requestedRole
      )
      const requestId = request.targetId ?? getStringInput(request.input, 'requestId')
      const version = getNumberInput(request.input, 'version')
      if (actionKey === 'refresh') return success('Refreshed', '已刷新')
      if (actionKey === 'simulate_vehicle_issue') {
        const vehicleNo = getStringInput(request.input, 'vehicleNo')
        const status = getStringInput(request.input, 'vehicleStatus')
        if (!vehicleNo || (status !== 'customs_locked' && status !== 'under_maintenance')) {
          return failure('Vehicle number and issue status are required', '请选择车辆和模拟状态')
        }
        const vehicle = this.service.simulateVehicleIssue(actor, vehicleNo, status)
        return {
          success: true,
          message: text(
            `Vehicle ${vehicle.vehicleNo} status changed to ${vehicle.status}`,
            `车辆 ${vehicle.vehicleNo} 已切换为${vehicle.status === 'customs_locked' ? '海关锁' : '维护中'}`
          ),
          refresh: true,
          data: vehicle
        }
      }
      if (!requestId) return failure('Request is required', '缺少自提申请')
      if (actionKey === 'approve') {
        const result = await this.service.approve(actor, requestId, version)
        if (result.status === 'rejected') {
          return {
            success: true,
            message: text(
              result.approvalReason || 'System rejected',
              result.approvalReason || '系统驳回'
            ),
            refresh: true,
            data: result
          }
        }
        return { ...success('Request approved', '审批通过'), data: result }
      }
      if (actionKey === 'reject') {
        const reason = getStringInput(request.input, 'reason')
        if (!reason) return failure('Rejection reason is required', '请填写驳回理由')
        return { ...success('Request rejected', '申请已驳回'), data: await this.service.reject(actor, requestId, version, reason) }
      }
      if (actionKey === 'cancel') {
        const reason = getStringInput(request.input, 'reason') || '审批人取消'
        return { ...success('Request cancelled', '申请已取消'), data: await this.service.cancel(actor, requestId, version, reason) }
      }
      if (actionKey === 'execute') {
        const result = await this.service.execute(actor, requestId, version)
        return {
          success: result.success,
          message: text(result.message, result.message),
          refresh: true,
          data: result.request
        }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed'
      return {
        success: false,
        message: text(message, message),
        refresh: true
      }
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: {
      isolation: 'iframe',
      entry: VEHICLE_PICKUP_REMOTE_ENTRY_KEY
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
      supportsPagination: false,
      supportsSearch: true,
      supportsSort: false,
      supportsFilter: true,
      supportsParameters: true
    },
    cache: { enabled: false }
  }
}

function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'vehicle-pickup-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...VEHICLE_PICKUP_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 500
        }
      }
    ]
  }
}

function getStringParameter(
  parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined,
  key: string
) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumberInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
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
