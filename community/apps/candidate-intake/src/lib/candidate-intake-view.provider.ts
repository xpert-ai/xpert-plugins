import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  CANDIDATE_INTAKE_FEATURE,
  CANDIDATE_INTAKE_ICON,
  CANDIDATE_INTAKE_PLUGIN_NAME,
  CANDIDATE_INTAKE_REMOTE_ENTRY,
  CANDIDATE_INTAKE_VIEW,
  CANDIDATE_INTAKE_VIEW_PROVIDER
} from './constants.js'
import { CandidateIntakeService } from './candidate-intake.service.js'
import type { CandidateScope, HrDecision, JobQuestion } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(CANDIDATE_INTAKE_VIEW_PROVIDER)
export class CandidateIntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: CandidateIntakeService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || !['agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    return [
      {
        key: CANDIDATE_INTAKE_VIEW,
        title: text('Candidate Intake', '候选人招聘登记'),
        description: text('Create invitations, review submissions, and confirm Agent screening.', '创建邀请、审核候选人提交信息并确认 Agent 初筛。'),
        icon: { type: 'font', value: 'ri-user-search-line' },
        hostType: context.hostType,
        slot,
        order: 20,
        refreshable: true,
        activation: { requiredFeatures: [CANDIDATE_INTAKE_FEATURE] },
        ...(slot === 'agent.workbench.fixed'
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Candidate Intake', '候选人招聘登记'),
                  order: 20,
                  icon: { type: 'svg', value: CANDIDATE_INTAKE_ICON, alt: 'Candidate Intake' }
                }
              }
            }
          : {}),
        source: { provider: CANDIDATE_INTAKE_VIEW_PROVIDER, plugin: CANDIDATE_INTAKE_PLUGIN_NAME },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: CANDIDATE_INTAKE_REMOTE_ENTRY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: { supportsPagination: false, supportsSearch: false, supportsParameters: true },
          cache: { enabled: false }
        },
        clientCommands: [
          { key: 'assistant.chat.send_message', label: text('Send screening task', '发送初筛任务') }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), actionType: 'refresh' },
          { key: 'create_job', label: text('Create job', '创建岗位'), actionType: 'invoke' },
          { key: 'create_invitation', label: text('Create invitation', '创建邀请'), actionType: 'invoke' },
          { key: 'start_screening', label: text('Start screening', '开始初筛'), actionType: 'invoke' },
          { key: 'confirm_decision', label: text('Confirm decision', '确认决定'), actionType: 'invoke' },
          { key: 'reopen_application', label: text('Reopen application', '重新开放填写'), actionType: 'invoke' }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== CANDIDATE_INTAKE_VIEW || component.entry !== CANDIDATE_INTAKE_REMOTE_ENTRY) {
      return { html: '<!doctype html><html><body>Unsupported view.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const appScript = await readFile(join(__dirname, 'remote-components', CANDIDATE_INTAKE_REMOTE_ENTRY, 'app.js'), 'utf8')
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({ title: 'Candidate Intake', lang: 'zh-Hans', reactUmd: react, reactDomUmd: reactDom, appScript }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== CANDIDATE_INTAKE_VIEW) return {}
    return {
      item: await this.service.getWorkbenchData(
        scopeFromContext(context),
        readString(query.parameters?.applicationId) ?? query.selectionId
      )
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CANDIDATE_INTAKE_VIEW) return failure('Unsupported view.')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') return success('Refreshed.')
      if (actionKey === 'create_job') {
        const result = await this.service.createJob(scope, {
          companyName: requiredInput(request, 'companyName'),
          roleName: requiredInput(request, 'roleName'),
          roleDescription: requiredInput(request, 'roleDescription'),
          requiredCriteria: stringListInput(request, 'requiredCriteria'),
          preferredCriteria: stringListInput(request, 'preferredCriteria'),
          questions: arrayInput<JobQuestion>(request, 'questions'),
          defaultExpiryDays: numberInput(request, 'defaultExpiryDays')
        })
        return { ...success('Job created.'), data: result }
      }
      if (actionKey === 'create_invitation') {
        const result = await this.service.createInvitation(
          scope,
          requiredInput(request, 'jobId'),
          numberInput(request, 'expiryDays')
        )
        return { ...success('Invitation created.'), data: result }
      }
      if (actionKey === 'start_screening') {
        const applicationId = applicationIdFrom(request)
        await this.service.startScreening(scope, applicationId)
        return {
          ...success('Screening task prepared.'),
          refresh: false,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: [
                `请对候选人申请 ${applicationId} 执行招聘初筛。`,
                '先调用 candidate_intake_get_screening_context 获取岗位条件和候选人材料。',
                '逐条评估必需条件与加分条件，仅使用材料中的证据；未体现的信息标记为 not_evidenced。',
                '最后调用 candidate_intake_save_screening 保存结果，不要根据照片或受保护个人特征作出判断。',
                '工具参数必须是完整、严格合法的 JSON；只使用工具定义中的字段，不要在字符串中使用换行、引号或 Markdown。',
                '每条 evidence 与 explanation 保持简短，strengths、concerns、followUpQuestions 各不超过 3 项。',
                '不要讨论历史对话或工具是否可用；工具保存成功后只给出简短结论，并提醒最终决定由 HR 人工确认。'
              ].join('\n')
            }
          }
        }
      }
      if (actionKey === 'confirm_decision') {
        const result = await this.service.confirmDecision(
          scope,
          applicationIdFrom(request),
          requiredInput(request, 'decision') as HrDecision,
          readString(request.input?.note)
        )
        return { ...success('Decision confirmed.'), data: result }
      }
      if (actionKey === 'reopen_application') {
        const result = await this.service.reopen(scope, applicationIdFrom(request))
        return { ...success('Application reopened.'), data: result }
      }
      return failure('Unsupported action.')
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Action failed.')
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): CandidateScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function success(message: string): XpertViewActionResult {
  return { success: true, message: text(message, message), refresh: true }
}

function failure(message: string): XpertViewActionResult {
  return { success: false, message: text(message, message) }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredInput(request: XpertViewActionRequest, key: string) {
  const value = readString(request.input?.[key])
  if (!value) throw new Error(`${key} is required.`)
  return value
}

function stringListInput(request: XpertViewActionRequest, key: string) {
  const value = request.input?.[key]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  const textValue = readString(value)
  return textValue ? textValue.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : []
}

function arrayInput<T>(request: XpertViewActionRequest, key: string) {
  const value = request.input?.[key]
  return Array.isArray(value) ? (value as T[]) : []
}

function numberInput(request: XpertViewActionRequest, key: string) {
  const value = request.input?.[key]
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function applicationIdFrom(request: XpertViewActionRequest) {
  return readString(request.input?.applicationId) ?? readString(request.targetId) ?? requiredInput(request, 'applicationId')
}
