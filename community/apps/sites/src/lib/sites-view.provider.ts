import { Inject, Injectable, Optional } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  I18nObject,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar,
  type IconDefinition
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareRuntimeCapabilityRegistry,
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SITES_FEATURE,
  SITES_MIDDLEWARE_TOOL_NAMES,
  SITES_PLUGIN_NAME,
  SITES_PROVIDER_KEY,
  SITES_REMOTE_ENTRY_KEY,
  SITES_VIEW_KEY,
  WORKBENCH_BROWSER_OPEN_CLIENT_COMMAND
} from './constants.js'
import { buildSitesDeploymentPreviewEvent, SitesService } from './sites.service.js'
import type { SitesAccessMode, SitesScope, SitesSourceFile, SitesStorageShape } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = {
  type: 'font',
  value: 'ri-window-line'
} satisfies IconDefinition
const VIEW_ICON_MANIFEST_VALUE = VIEW_ICON as unknown as string

const createSiteInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: text('Name', '名称') },
    prompt: { type: 'string', title: text('Prompt', '提示词') },
    storageShape: { type: 'string', title: text('Storage', '存储形态') },
    accessMode: { type: 'string', title: text('Access', '访问权限') }
  },
  required: ['name', 'prompt']
} satisfies JsonSchemaObjectType

const saveVersionInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') },
    prompt: { type: 'string', title: text('Prompt', '提示词') },
    title: { type: 'string', title: text('Version Title', '版本标题') }
  }
} satisfies JsonSchemaObjectType

const deployVersionInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') },
    versionId: { type: 'string', title: text('Version', '版本') },
    accessMode: { type: 'string', title: text('Access', '访问权限') }
  }
} satisfies JsonSchemaObjectType

const changeAccessInputSchema = {
  type: 'object',
  properties: {
    accessMode: { type: 'string', title: text('Access', '访问权限') },
    customAudience: { type: 'array', title: text('Custom Audience', '自定义受众') }
  },
  required: ['accessMode']
} satisfies JsonSchemaObjectType

const envInputSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', title: text('Key', '键') },
    value: { type: 'string', title: text('Value', '值') },
    secret: { type: 'boolean', title: text('Secret', '密钥') },
    description: { type: 'string', title: text('Description', '描述') }
  },
  required: ['key']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(SITES_PROVIDER_KEY)
export class SitesViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: SitesService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }

    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: SITES_VIEW_KEY,
        title: text('Sites', 'Sites 站点'),
        description: text('Create, save, deploy, and inspect hosted Sites projects.', '创建、保存、发布和查看托管站点项目。'),
        icon: VIEW_ICON_MANIFEST_VALUE,
        hostType: 'agent',
        slot,
        order: fixed ? 40 : 30,
        refreshable: true,
        activation: {
          requiredFeatures: [SITES_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Sites', 'Sites'),
                  order: 40,
                  icon: VIEW_ICON_MANIFEST_VALUE
                }
              }
            }
          : {}),
        source: {
          provider: SITES_PROVIDER_KEY,
          plugin: SITES_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'projectId',
            label: text('Project', '项目'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: SITES_REMOTE_ENTRY_KEY
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
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 30
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'sites-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...SITES_MIDDLEWARE_TOOL_NAMES]
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: WORKBENCH_BROWSER_OPEN_CLIENT_COMMAND,
            label: text('Open Site Preview', '打开站点预览'),
            description: text(
              'Open the generated Sites deployment in the Workbench browser tab.',
              '在 Workbench 浏览器标签页中打开生成的 Sites 发布页面。'
            )
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
            key: 'create_site',
            label: text('Create Site', '创建站点'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: createSiteInputSchema
          },
          {
            key: 'save_version',
            label: text('Save Version', '保存版本'),
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: saveVersionInputSchema
          },
          {
            key: 'deploy_version',
            label: text('Deploy', '发布'),
            icon: 'ri-rocket-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: deployVersionInputSchema
          },
          {
            key: 'change_access',
            label: text('Access', '访问权限'),
            icon: 'ri-lock-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: changeAccessInputSchema
          },
          {
            key: 'upsert_env',
            label: text('Save Env', '保存环境值'),
            icon: 'ri-key-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: envInputSchema
          },
          {
            key: 'remove_env',
            label: text('Remove Env', '移除环境值'),
            icon: 'ri-delete-bin-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: envInputSchema
          },
          {
            key: 'archive_project',
            label: text('Archive', '归档'),
            icon: 'ri-archive-line',
            placement: 'row',
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
    if (viewKey !== SITES_VIEW_KEY || component.entry !== SITES_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appScript = await readFile(join(__dirname, 'remote-components', SITES_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Sites',
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
    if (viewKey !== SITES_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      projectId: getStringParameter(query.parameters, 'projectId'),
      search: query.search,
      limit: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== SITES_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Sites refreshed', 'Sites 已刷新')
      }
      if (actionKey === 'create_site') {
        const input = request.input ?? {}
        const data = await this.service.createAndDeploy(
          {
            name: getStringInput(input, 'name') ?? 'Untitled Site',
            prompt: getStringInput(input, 'prompt') ?? 'Create a concise internal site.',
            storageShape: getStringInput(input, 'storageShape') as SitesStorageShape,
            accessMode: getStringInput(input, 'accessMode') as SitesAccessMode
          },
          scope
        )
        const event = buildSitesDeploymentPreviewEvent(data)
        return {
          ...success('Site created and deployed', '站点已创建并发布'),
          data: event ? { ...data, event } : data
        }
      }
      if (actionKey === 'save_version') {
        const input = request.input ?? {}
        const data = await this.service.saveVersion(
          {
            projectId: getStringInput(input, 'projectId') ?? getStringParameter(request.parameters, 'projectId') ?? request.targetId,
            prompt: getStringInput(input, 'prompt'),
            title: getStringInput(input, 'title'),
            files: readFilesInput(input)
          },
          scope
        )
        return { ...success('Version saved', '版本已保存'), data }
      }
      if (actionKey === 'deploy_version') {
        const input = request.input ?? {}
        const data = await this.service.deployVersion(
          {
            projectId: getStringInput(input, 'projectId') ?? getStringParameter(request.parameters, 'projectId') ?? request.targetId,
            versionId: getStringInput(input, 'versionId'),
            accessMode: getStringInput(input, 'accessMode') as SitesAccessMode
          },
          scope
        )
        const event = buildSitesDeploymentPreviewEvent({ deployment: data })
        return { ...success('Version deployed', '版本已发布'), data: event ? { ...data, event } : data }
      }
      if (actionKey === 'change_access') {
        const input = request.input ?? {}
        const data = await this.service.setAccess(
          scope,
          getStringParameter(request.parameters, 'projectId') ?? request.targetId ?? getStringInput(input, 'projectId') ?? '',
          getStringInput(input, 'accessMode') as SitesAccessMode,
          readStringArrayInput(input, 'customAudience')
        )
        return { ...success('Access updated', '访问权限已更新'), data }
      }
      if (actionKey === 'upsert_env') {
        const input = request.input ?? {}
        const data = await this.service.upsertEnvironmentValue(scope, {
          projectId: getStringParameter(request.parameters, 'projectId') ?? request.targetId ?? getStringInput(input, 'projectId') ?? '',
          key: getStringInput(input, 'key') ?? '',
          value: getStringInput(input, 'value'),
          secret: getBooleanInput(input, 'secret'),
          description: getStringInput(input, 'description')
        })
        return { ...success('Environment value saved', '环境值已保存'), data }
      }
      if (actionKey === 'remove_env') {
        const input = request.input ?? {}
        const data = await this.service.removeEnvironmentValue(
          scope,
          getStringParameter(request.parameters, 'projectId') ?? getStringInput(input, 'projectId') ?? '',
          request.targetId ?? getStringInput(input, 'key') ?? ''
        )
        return { ...success('Environment value removed', '环境值已移除'), data }
      }
      if (actionKey === 'archive_project') {
        const data = await this.service.archiveProject(scope, request.targetId ?? getStringParameter(request.parameters, 'projectId') ?? '')
        return { ...success('Project archived', '项目已归档'), data }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Sites action failed'
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): SitesScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getBooleanInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function readStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

function readFilesInput(input: Record<string, unknown> | null | undefined): SitesSourceFile[] | undefined {
  const value = input?.['files']
  return Array.isArray(value) ? (value as SitesSourceFile[]) : undefined
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

function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
