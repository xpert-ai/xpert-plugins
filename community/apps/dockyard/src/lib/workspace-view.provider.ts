import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type {
  XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest,
  XpertViewActionResult, XpertViewDataResult, XpertViewQuery, XpertRemoteComponentViewSchema,
  XpertRemoteComponentEntry
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ACTION_KEYS, FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY } from './constants.js'
import { DockyardWorkspaceService } from './workspace.service.js'
import { scopeFromView } from './scope.js'
import { DockyardError, saveBuffersSchema, saveScratchpadSchema, saveWorkspaceSchema } from './domain/contracts.js'

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class DockyardWorkspaceViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DockyardWorkspaceService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    const labels = [['Save layout', '保存布局'], ['Save files', '保存文件'], ['Save scratchpad', '保存便签']]
    return [{
      key: VIEW_KEY, title: { en_US: 'Dockyard', zh_Hans: 'Dockyard 工作台' },
      description: { en_US: 'Dockyard workbench with chat references.', zh_Hans: 'Dockyard 工作台与聊天引用。' },
      icon: { type: 'font', value: 'ri-layout-4-line' }, hostType: 'agent', slot,
      order: 30, refreshable: false, activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: {
        enabled: true, label: { en_US: 'Dockyard', zh_Hans: 'Dockyard 工作台' }, order: 30
      } } } : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'esm', protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: ACTION_KEYS.map((key, index) => ({ key, label: { en_US: labels[index][0], zh_Hans: labels[index][1] }, actionType: 'invoke', placement: 'toolbar' })),
      clientCommands: [{ key: 'assistant.composer.append_references', label: { en_US: 'Reference in chat', zh_Hans: '引用到聊天' } }]

    }]
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new DockyardError('not_found')
    return scopeFromView(context)
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    if (query.parameters && Object.keys(query.parameters).length) throw new DockyardError('not_found')
    return { item: await this.service.getWorkspace(scope) }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      switch (actionKey) {
        case 'save_workspace': return { success: true, data: await this.service.saveWorkspace(scope, saveWorkspaceSchema.parse(request.input)) }
        case 'save_buffers': return { success: true, data: await this.service.saveBuffers(scope, saveBuffersSchema.parse(request.input)) }
        case 'save_scratchpad': return { success: true, data: await this.service.saveScratchpad(scope, saveScratchpadSchema.parse(request.input)) }
        default: throw new DockyardError('not_found')
      }
    } catch (error) {
      if (error instanceof DockyardError) return { success: false, data: { code: error.code, contentId: error.contentId } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      throw error
    }
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new DockyardError('not_found')
    return { html: await readFile(new URL('../remote/dockyard.html', import.meta.url), 'utf8'), contentType: 'text/html; charset=utf-8' }
  }
}
