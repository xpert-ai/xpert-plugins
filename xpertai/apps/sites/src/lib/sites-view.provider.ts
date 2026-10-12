import { Injectable, Logger } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, ASSISTANT_CONTEXT_SET_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type XpertExtensionViewManifest, type XpertRemoteComponentViewSchema, type XpertResolvedViewHostContext, type XpertViewActionRequest, type XpertViewActionResult, type XpertViewQuery } from '@xpert-ai/contracts'
import { type IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { SITES_FEATURE, SITES_ICON, SITES_MIDDLEWARE_TOOL_NAMES, SITES_PLUGIN_NAME, SITES_PROVIDER_KEY, SITES_REMOTE_ENTRY_KEY, SITES_VIEW_KEY } from './constants.js'
import { SitesService } from './sites.service.js'
import type { SitesScope } from './types.js'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const access = z.enum(['admins_only', 'workspace_all', 'custom', 'public_link'])
const project = z.object({ projectId: z.string().uuid() }).strict()
const deploy = project.extend({ versionId: z.string().uuid(), accessMode: access, confirmed: z.literal(true), customAudience: z.array(z.string().uuid()).max(100).optional(), userConfirmedPublicLink: z.boolean().optional() })
const logger = new Logger('SitesView')
const scope = (c: XpertResolvedViewHostContext): SitesScope => ({ tenantId: c.tenantId, organizationId: c.organizationId, userId: c.userId, assistantId: c.hostId })

@Injectable()
@ViewExtensionProvider(SITES_PROVIDER_KEY)
export class SitesViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SitesService) {}
  supports(c: XpertResolvedViewHostContext) { return c.hostType === 'agent' }
  getViewManifests(_c: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!['agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    const icon = { type: 'svg' as const, value: SITES_ICON }
    return [{ key: SITES_VIEW_KEY, title: text('Sites', '站点'), icon, hostType: 'agent', slot, order: 40,
      activation: { requiredFeatures: [SITES_FEATURE] }, source: { provider: SITES_PROVIDER_KEY, plugin: SITES_PLUGIN_NAME }, refreshable: true,
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: text('Sites', '站点'), icon, order: 40 } } } : {}),
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: SITES_REMOTE_ENTRY_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsSelection: true, supportsParameters: true, defaultPageSize: 6 }, cache: { enabled: false } },
      clientCommands: [ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, ASSISTANT_CONTEXT_SET_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND].map(key => ({ key })),
      hostEvents: { subscriptions: [{ key: 'sites-tool-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: [...SITES_MIDDLEWARE_TOOL_NAMES] }, action: { type: 'forward', debounceMs: 500 } }] },
      parameters: [{ key: 'projectId', type: 'string', label: text('Project', '项目') }, { key: 'tab', type: 'string', label: text('Tab', '标签页') }],
      actions: ['create_site', 'deploy_version', 'restore_version', 'change_access', 'publish_artifact_link', 'revoke_artifact_link', 'upsert_env', 'remove_env', 'archive_project'].map(key => ({ key, label: text(key, key), actionType: 'invoke' as const })) }]
  }
  async getRemoteComponentEntry(_c: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    if (key !== SITES_VIEW_KEY || component.entry !== SITES_REMOTE_ENTRY_KEY) throw new Error('view_not_found')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(file => readFile(new URL('./remote-components/sites-workbench/' + file, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'Sites', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(c: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    if (key !== SITES_VIEW_KEY) throw new Error('view_not_found')
    const input = z.object({ projectId: z.string().uuid().optional(), versionId: z.string().uuid().optional(), preview: z.boolean().optional(), page: z.number().int().min(1).max(1000), limit: z.number().int().min(1).max(30), search: z.string().max(200).optional() }).parse({
      projectId: query.selectionId ?? query.parameters?.projectId, versionId: query.parameters?.versionId, preview: query.parameters?.preview,
      page: query.page ?? 1, limit: query.pageSize ?? 6, search: query.search
    })
    return this.service.getViewData(scope(c), input)
  }
  async executeViewAction(c: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (key !== SITES_VIEW_KEY) throw new Error('view_not_found')
      const s = scope(c), input = request.input
      let result: object
      switch (action) {
        case 'create_site': {
          const v = z.object({ name: z.string().trim().min(1).max(100), prompt: z.string().max(8000).optional() }).strict().parse(input)
          const p = await this.service.createProject({ name: v.name!, prompt: v.prompt, storageShape: 'static' }, s)
          result = { projectId: p.id }; break
        }
        case 'deploy_version': result = await this.service.deployVersion(deploy.parse(input), s); break
        case 'restore_version': { const v = project.extend({ versionId: z.string().uuid() }).parse(input); result = await this.service.restoreVersion(s, v.projectId, v.versionId); break }
        case 'change_access': { const v = project.extend({ accessMode: access, customAudience: z.array(z.string().uuid()).max(100).optional(), userConfirmedPublicLink: z.boolean().optional(), confirmed: z.literal(true) }).parse(input); await this.service.setAccess(s, v.projectId, v.accessMode, v.customAudience, v.userConfirmedPublicLink); result = { projectId: v.projectId }; break }
        case 'publish_artifact_link': { const v = z.object({ deploymentId: z.string().uuid(), userConfirmedPublicLink: z.literal(true), expiresAt: z.string().datetime().optional() }).strict().parse(input); result = await this.service.publishArtifactLink({ deploymentId: v.deploymentId!, userConfirmedPublicLink: v.userConfirmedPublicLink, expiresAt: v.expiresAt }, s); break }
        case 'revoke_artifact_link': { const v = z.object({ deploymentId: z.string().uuid(), confirmed: z.literal(true) }).strict().parse(input); result = await this.service.revokeArtifactLink({ deploymentId: v.deploymentId! }, s); break }
        case 'upsert_env': { const v = project.extend({ key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(100), value: z.string().max(10000).optional(), secret: z.boolean(), description: z.string().max(500).optional() }).parse(input); result = await this.service.upsertEnvironmentValue(s, { ...v, projectId: v.projectId!, key: v.key! }); break }
        case 'remove_env': { const v = project.extend({ key: z.string().min(1), confirmed: z.literal(true) }).parse(input); result = await this.service.removeEnvironmentValue(s, v.projectId, v.key); break }
        case 'archive_project': { const v = project.parse(input); await this.service.archiveProject(s, v.projectId); result = { projectId: v.projectId }; break }
        default: throw new Error('unknown_action')
      }
      // Return only business receipts, never persistence scope or credential fields.
      if (action === 'deploy_version') result = { deployed: true }
      return { success: true, data: result, refresh: true }
    } catch (error) {
      logger.warn(error instanceof Error ? error.name : 'SitesActionError')
      return { success: false, refresh: false, data: { code: error instanceof z.ZodError ? 'invalid_input' : 'operation_failed' } }
    }
  }
}
