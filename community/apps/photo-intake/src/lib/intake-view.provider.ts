import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import { renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  ACTION_KEYS,
  FEATURE,
  MUTATING_TOOLS,
  PLUGIN_NAME,
  PROVIDER_KEY,
  REMOTE_ENTRY,
  VIEW_KEY
} from './constants.js'
import { CATEGORIES } from './domain/categories.js'
import { createCaseSchema, IntakeError, viewQueryParametersSchema } from './domain/contracts.js'
import { IntakeService } from './intake.service.js'
import { scopeFromView } from './scope.js'

const SLOTS = ['agent.workbench.main', 'agent.workbench.fixed']
const TITLE = { en_US: 'Photo intake', zh_Hans: '拍照受理' }
const requireHere = createRequire(import.meta.url)

async function readPackageFile(name: string, file: string) {
  return readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class PhotoIntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: IntakeService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !SLOTS.includes(slot)) return []
    return [{
      key: VIEW_KEY,
      title: TITLE,
      description: {
        en_US: 'Review reported issues and the categories suggested for them.',
        zh_Hans: '查看上报的问题和为它建议的类别。'
      },
      icon: { type: 'font', value: 'ri-camera-lens-line' },
      hostType: 'agent',
      slot,
      order: 30,
      refreshable: true,
      activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed'
        ? { workbench: { fixed: true, menu: { enabled: true, label: TITLE, order: 30 } } }
        : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: {
        type: 'remote_component',
        runtime: 'esm',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY },
        dataSource: { mode: 'platform' }
      },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: [{
        key: ACTION_KEYS[0],
        label: { en_US: 'New case', zh_Hans: '新建受理单' },
        actionType: 'invoke',
        placement: 'toolbar'
      }],
      // The view asks the Assistant to analyse a case by sending a chat message on the user's behalf.
      clientCommands: [{
        key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        label: { en_US: 'Ask the Assistant to analyse', zh_Hans: '让助手识别' }
      }],
      hostEvents: {
        subscriptions: [{
          key: 'photo-intake-tool-completed',
          event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: [...MUTATING_TOOLS] },
          action: { type: 'forward', debounceMs: 500 }
        }]
      }
    }]
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new IntakeError('not_found')
    return scopeFromView(context)
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    const parameters = viewQueryParametersSchema.safeParse(query.parameters ?? {})
    if (!parameters.success) throw new IntakeError('invalid_input')
    const cases = await this.service.listCases(scope)
    let selected = null
    if (parameters.data.caseId) {
      try {
        selected = await this.service.getCaseDetail(scope, parameters.data.caseId)
      } catch (error) {
        // A case that is gone or belongs to someone else simply shows as not selected.
        if (!(error instanceof IntakeError && error.code === 'not_found')) throw error
      }
    }
    return { item: { cases, categories: CATEGORIES, selected } }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      switch (actionKey) {
        case 'create_case':
          return { success: true, data: await this.service.createCase(scope, createCaseSchema.parse(request.input)) }
        default:
          throw new IntakeError('not_found')
      }
    } catch (error) {
      if (error instanceof IntakeError) return { success: false, data: { code: error.code } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      throw error
    }
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new IntakeError('not_found')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(new URL('../remote/app.js', import.meta.url), 'utf8'),
      readFile(new URL('../remote/app.css', import.meta.url), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      contentType: 'text/html; charset=utf-8',
      html: renderRemoteReactIframeHtml({ title: 'Photo intake', appScript, appCss, reactUmd, reactDomUmd })
    }
  }
}
