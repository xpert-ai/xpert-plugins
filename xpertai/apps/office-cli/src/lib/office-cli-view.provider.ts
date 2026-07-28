import { Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  IconDefinition,
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
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_ICON,
  OFFICE_CLI_PLUGIN_NAME,
  OFFICE_CLI_PROVIDER_KEY,
  OFFICE_CLI_REMOTE_ENTRY_KEY,
  OFFICE_CLI_TOOL_NAMES,
  OFFICE_CLI_VIEW_KEY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { OfficeCliService } from './office-cli.service.js'
import type {
  OfficeCliCommand,
  OfficeCliDocumentFormat,
  OfficeCliScope
} from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const viewIcon = {
  type: 'svg',
  value: OFFICE_CLI_ICON,
  alt: 'OfficeCLI'
} satisfies IconDefinition
const compatibleViewIcon = viewIcon as unknown as XpertExtensionViewManifest['icon']

@Injectable()
@ViewExtensionProvider(OFFICE_CLI_PROVIDER_KEY)
export class OfficeCliViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: OfficeCliService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }
    const fixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT
    return [{
      key: OFFICE_CLI_VIEW_KEY,
      title: text('OfficeCLI', 'OfficeCLI 原生 Office'),
      description: text(
        'Create, render, inspect, edit, validate, version, and restore native Office files.',
        '创建、渲染、检查、编辑、验证、版本化和恢复原生 Office 文件。'
      ),
      icon: compatibleViewIcon,
      hostType: context.hostType,
      slot,
      order: 43,
      refreshable: true,
      activation: {
        requiredFeatures: [OFFICE_CLI_FEATURE]
      },
      ...(fixedWorkbench
        ? {
            workbench: {
              fixed: true,
              menu: {
                enabled: true,
                label: text('OfficeCLI', 'OfficeCLI 原生 Office'),
                order: 43,
                icon: compatibleViewIcon
              }
            }
          }
        : {}),
      source: {
        provider: OFFICE_CLI_PROVIDER_KEY,
        plugin: OFFICE_CLI_PLUGIN_NAME
      },
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: {
          isolation: 'iframe',
          entry: OFFICE_CLI_REMOTE_ENTRY_KEY
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
        subscriptions: [{
          key: 'office-cli-tool-completed',
          event: 'assistant.tool.completed',
          filter: {
            sources: ['chatkit'],
            toolNames: [...OFFICE_CLI_TOOL_NAMES]
          },
          action: {
            type: 'refresh-and-forward',
            debounceMs: 1000
          }
        }]
      },
      clientCommands: [{
        key: 'assistant.context.set',
        label: text('Set active Office document', '设置当前 Office 文件')
      }],
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'create_document', label: text('New Office File', '新建 Office 文件'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'import_document', label: text('Import Office File', '导入 Office 文件'), icon: 'ri-upload-cloud-2-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' },
        { key: 'run_command', label: text('Run OfficeCLI Command', '执行 OfficeCLI 命令'), actionType: 'invoke' },
        { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
        { key: 'get_file', label: text('Download Native File', '下载原生文件'), icon: 'ri-download-line', actionType: 'invoke' },
        { key: 'delete_document', label: text('Delete Document', '永久删除文档'), icon: 'ri-delete-bin-line', actionType: 'invoke' }
      ]
    }]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== OFFICE_CLI_VIEW_KEY || component.entry !== OFFICE_CLI_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported OfficeCLI component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentDir = join(moduleDir, 'remote-components', OFFICE_CLI_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'OfficeCLI',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
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
    if (viewKey !== OFFICE_CLI_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      documentId: getStringParameter(query.parameters, 'documentId') ?? query.selectionId,
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
    if (viewKey !== OFFICE_CLI_VIEW_KEY) {
      return failure('Unsupported OfficeCLI view', '不支持的 OfficeCLI 视图')
    }
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('OfficeCLI refreshed', 'OfficeCLI 已刷新')
      }
      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          format: requireStringInput(request.input, 'format', 'Office format is required.') as OfficeCliDocumentFormat,
          title: requireStringInput(request.input, 'title', 'Office document title is required.'),
          description: getStringInput(request.input, 'description'),
          assistantId: getActionXpertId(context, request.input),
          conversationId: getStringInput(request.input, 'conversationId')
        })
        return { ...success('OfficeCLI document created', 'OfficeCLI 文档已创建'), data: result }
      }
      if (actionKey === 'run_command') {
        const result = await this.service.executeCommand(scope, {
          documentId: requireDocumentId(request),
          command: requireStringInput(request.input, 'command', 'OfficeCLI command is required.') as OfficeCliCommand,
          args: getStringArrayInput(request.input, 'args'),
          stdin: getStringInput(request.input, 'stdin'),
          expectedVersionNumber: getNumberInput(request.input, 'expectedVersionNumber'),
          changeSummary: getStringInput(request.input, 'changeSummary'),
          dangerousConfirmed: getBooleanInput(request.input, 'dangerousConfirmed'),
          source: 'workbench'
        })
        return { ...success('OfficeCLI command completed', 'OfficeCLI 命令已完成'), data: result }
      }
      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(scope, {
          documentId: requireDocumentId(request),
          versionId: requireStringInput(request.input, 'versionId', 'OfficeCLI version id is required.'),
          expectedVersionNumber: getNumberInput(request.input, 'expectedVersionNumber'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('OfficeCLI version restored', 'OfficeCLI 版本已恢复'), data: result }
      }
      if (actionKey === 'get_file') {
        const result = await this.service.getFile(scope, requireDocumentId(request))
        return { ...success('OfficeCLI file prepared', 'OfficeCLI 文件已准备'), data: result, refresh: false }
      }
      if (actionKey === 'delete_document') {
        const result = await this.service.deleteDocument(scope, requireDocumentId(request))
        return { ...success('OfficeCLI document deleted', 'OfficeCLI 文档已永久删除'), data: result }
      }
      if (actionKey === 'prepare_assistant_prompt') {
        const result = await this.service.prepareAssistantPrompt(
          scope,
          requireDocumentId(request),
          getStringInput(request.input, 'instruction')
        )
        return { ...success('Assistant prompt prepared', 'Assistant 指令已准备'), data: result, refresh: false }
      }
      return failure('Unsupported OfficeCLI action', '不支持的 OfficeCLI 操作')
    } catch (error) {
      const message = getErrorMessage(error, 'OfficeCLI action failed.')
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
    if (viewKey !== OFFICE_CLI_VIEW_KEY || actionKey !== 'import_document') {
      return failure('Unsupported OfficeCLI file action', '不支持的 OfficeCLI 文件操作')
    }
    try {
      const fileName = getStringInput(request.input, 'name') ?? file.originalname ?? 'uploaded.office'
      const result = await this.service.importDocument(scopeFromContext(context), {
        title: getStringInput(request.input, 'title'),
        description: getStringInput(request.input, 'description'),
        fileName,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer,
        assistantId: getActionXpertId(context, request.input),
        conversationId: getStringInput(request.input, 'conversationId')
      })
      return { ...success('Office file imported into OfficeCLI', 'Office 文件已导入 OfficeCLI'), data: result }
    } catch (error) {
      const message = getErrorMessage(error, 'OfficeCLI file import failed.')
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
  return context.hostType === 'agent'
    && (slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT)
}

function scopeFromContext(context: XpertResolvedViewHostContext): OfficeCliScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    userId: context.userId,
    assistantId: context.hostType === 'agent' ? context.hostId : null
  }
}

function getActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'xpertId') ?? (context.hostType === 'agent' ? context.hostId : undefined)
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}

function requireDocumentId(request: XpertViewActionRequest) {
  return getStringInput(request.input, 'documentId')
    ?? getStringParameter(request.parameters, 'documentId')
    ?? requireString(request.targetId, 'OfficeCLI document id is required.')
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

function getStringArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBooleanInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function getStringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
