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
import { createCaseSchema, IntakeError } from './domain/contracts.js'
import { createRunSchema, decideRunSchema, reviewSampleSchema, runRevisionSchema, setReferenceSchema } from './domain/evaluation.js'
import { EvaluationService } from './evaluation.service.js'
import { IntakeService } from './intake.service.js'
import { scopeFromView } from './scope.js'

const SLOTS = ['agent.workbench.main', 'agent.workbench.fixed']
const TITLE = { en_US: 'Version acceptance', zh_Hans: '图片分类版本验收' }
const querySchema = z.object({
  caseId: z.string().uuid().optional(), runId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1)
}).strict()
const actionLabels = {
  create_case: { en_US: 'Add sample', zh_Hans: '添加样本' },
  set_reference: { en_US: 'Set reference label', zh_Hans: '保存参考标签' },
  create_run: { en_US: 'Create comparison', zh_Hans: '新建验收' },
  retry_failures: { en_US: 'Retry failures', zh_Hans: '重试失败项' },
  recover_run: { en_US: 'Recover interruption', zh_Hans: '恢复中断任务' },
  review_sample: { en_US: 'Save sample review', zh_Hans: '保存样本评审' },
  decide_run: { en_US: 'Save adoption decision', zh_Hans: '保存验收结论' }
}
const requireHere = createRequire(import.meta.url)

async function readPackageFile(name: string, file: string) {
  return readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class PhotoIntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: IntakeService, private readonly evaluations: EvaluationService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !SLOTS.includes(slot)) return []
    return [{
      key: VIEW_KEY,
      title: TITLE,
      description: {
        en_US: 'Compare two prompts on fixed images and save an adoption decision.',
        zh_Hans: '在固定图片上比较两版提示词，查看差异并保存采用决定。'
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
      actions: ACTION_KEYS.map(key => ({
        key,
        label: actionLabels[key],
        actionType: 'invoke',
        placement: 'toolbar'
      })),
      // The view asks the Assistant to analyse a case by sending a chat message on the user's behalf.
      clientCommands: [{
        key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        label: { en_US: 'Run evaluation', zh_Hans: '开始评测' }
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
    const parameters = querySchema.safeParse(query.parameters ?? {})
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
    const runs = await this.evaluations.list(scope, parameters.data.page)
    let run = null
    if (parameters.data.runId) {
      try { run = await this.evaluations.get(scope, parameters.data.runId) } catch (error) {
        if (!(error instanceof IntakeError && error.code === 'not_found')) throw error
      }
    }
    return { item: { cases, categories: CATEGORIES, selected, runs, run } }
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
        case 'set_reference':
          return { success: true, data: await this.service.setReference(scope, setReferenceSchema.parse(request.input)) }
        case 'create_run':
          return { success: true, data: await this.evaluations.create(scope, createRunSchema.parse(request.input)) }
        case 'retry_failures':
          return { success: true, data: await this.evaluations.retryFailures(scope, runRevisionSchema.parse(request.input)) }
        case 'recover_run':
          return { success: true, data: await this.evaluations.recover(scope, runRevisionSchema.parse(request.input)) }
        case 'review_sample':
          return { success: true, data: await this.evaluations.review(scope, reviewSampleSchema.parse(request.input)) }
        case 'decide_run':
          return { success: true, data: await this.evaluations.decide(scope, decideRunSchema.parse(request.input)) }
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
      html: renderRemoteReactIframeHtml({ title: 'Image version acceptance', appScript, appCss, reactUmd, reactDomUmd })
    }
  }
}
