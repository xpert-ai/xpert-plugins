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
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  PROJECT_DETAIL_SECTIONS_SLOT,
  RESUME_SCREENING_FEATURE,
  RESUME_SCREENING_ICON,
  RESUME_SCREENING_PLUGIN_NAME,
  RESUME_SCREENING_PROVIDER_KEY,
  RESUME_SCREENING_REMOTE_ENTRY_KEY,
  RESUME_SCREENING_VIEW_KEY
} from './constants.js'
import { ResumeScreeningService } from './resume-screening.service.js'
import type { ResumeDegreeLevel, ResumeScope } from './types.js'
import type { ResumeViewActionResult } from './action-contract.js'
import { ResumeRevisionConflictError, ResumeCriteriaLockedError } from './revision-conflict.error.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const TOOL_NAMES = ['resume_prescreen', 'resume_score']
const DEGREE_LEVELS: ResumeDegreeLevel[] = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']

@Injectable()
@ViewExtensionProvider(RESUME_SCREENING_PROVIDER_KEY)
export class ResumeScreeningViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ResumeScreeningService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: RESUME_SCREENING_VIEW_KEY,
        title: text('Resume Screening', '简历初筛'),
        description: text(
          'Create a screening case from a JD, review ranked candidates, and confirm interview decisions.',
          '根据 JD 创建筛查单，查看候选人排序并确认面试结论。'
        ),
        icon: {
          type: 'font',
          value: 'ri-file-user-line'
        },
        hostType: context.hostType,
        slot,
        order: 30,
        refreshable: true,
        activation: {
          requiredFeatures: [RESUME_SCREENING_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Resume Screening', '简历初筛'),
                  order: 30,
                  icon: {
                    type: 'svg',
                    value: RESUME_SCREENING_ICON,
                    alt: 'Resume Screening'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: RESUME_SCREENING_PROVIDER_KEY,
          plugin: RESUME_SCREENING_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: RESUME_SCREENING_REMOTE_ENTRY_KEY
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
          subscriptions: [
            {
              key: 'resume-screening-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          { key: 'assistant.context.set', label: text('Set screening context', '设置筛查上下文') },
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'get_screening', label: text('View screening', '查看筛查单'), placement: 'row', actionType: 'invoke' },
          { key: 'get_candidate', label: text('View resume', '查看简历'), placement: 'row', actionType: 'invoke' },
          { key: 'update_candidate', label: text('Edit resume', '编辑简历'), placement: 'row', actionType: 'invoke' },
          { key: 'prepare_scoring', label: text('Score selected candidates', '评分所选候选人'), placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'create_screening',
            label: text('New Screening', '新建筛查单'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'update_screening',
            label: text('Edit Screening', '编辑筛查单'),
            icon: 'ri-edit-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'add_candidate',
            label: text('Add Candidate', '添加候选人'),
            icon: 'ri-user-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'confirm_candidate',
            label: text('Confirm Candidate', '确认候选人'),
            icon: 'ri-check-line',
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
    if (viewKey !== RESUME_SCREENING_VIEW_KEY || component.entry !== RESUME_SCREENING_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(join(__dirname, 'remote-components', RESUME_SCREENING_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const appCss = await readFile(join(__dirname, 'remote-components', RESUME_SCREENING_REMOTE_ENTRY_KEY, 'app.css'), 'utf8')
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: '简历初筛',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== RESUME_SCREENING_VIEW_KEY) {
      return {}
    }

    if (getStringParameter(query.parameters, 'mode') === 'screenings') {
      return this.service.getScreeningList(scopeFromContext(context), { search: query.search,
        status: getStringParameter(query.parameters, 'status'), page: query.page, pageSize: query.pageSize })
    }

    return this.service.getWorkbenchData(scopeFromContext(context), {
      screeningId: getStringParameter(query.parameters, 'screeningId') ?? query.selectionId,
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
  ): Promise<ResumeViewActionResult> {
    if (viewKey !== RESUME_SCREENING_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Resume screening view refreshed', '简历初筛视图已刷新')
      }
      if (actionKey === 'get_screening') {
        const screening = await this.service.getScreeningDetail(scope, requireScreeningId(request))
        return { ...success('Screening loaded', '筛查单已加载'), data: { screening } }
      }

      if (actionKey === 'get_candidate') {
        const candidate = await this.service.getCandidateDetail(scope, requireScreeningId(request),
          requireStringInput(request.input, 'candidateId', 'Candidate id is required.'))
        return { ...success('Resume loaded', '简历已加载'), data: { candidate } }
      }
      if (actionKey === 'update_candidate') {
        const candidate = await this.service.updateCandidate(scope, {
          screeningId: requireScreeningId(request),
          candidateId: requireStringInput(request.input, 'candidateId', 'Candidate id is required.'),
          baseRevision: requireNumberInput(request.input, 'baseRevision', 'Resume version is required.'),
          name: requireStringInput(request.input, 'name', 'Candidate name is required.'),
          yearsOfExperience: requireNumberInput(request.input, 'yearsOfExperience', 'Years is required.'),
          degree: requireDegreeInput(request.input, 'degree'),
          skills: requireStringArrayInput(request.input, 'skills'),
          resumeText: requireStringInput(request.input, 'resumeText', 'Resume evidence is required.')
        })
        return { ...success('Resume updated', '简历已更新'), data: { candidate } }
      }
      if (actionKey === 'prepare_scoring') {
        const task = await this.service.prepareScoring(scope, {
          screeningId: requireScreeningId(request),
          requestId: requireStringInput(request.input, 'requestId', 'Request id is required.'),
          candidateIds: requireStringArrayInput(request.input, 'candidateIds'),
          replaceReviewed: request.input?.['replaceReviewed'] === true
        })
        return { ...success('Scoring selection saved', '评分范围已保存'), data: task }
      }

      if (actionKey === 'create_screening') {
        const result = await this.service.createScreening(scope, {
          requestId: getStringInput(request.input, 'requestId'),
          title: requireStringInput(request.input, 'title', 'Screening title is required.'),
          jobTitle: requireStringInput(request.input, 'jobTitle', 'Job title is required.'),
          jdText: requireStringInput(request.input, 'jdText', 'JD text is required.'),
          minYears: requireNumberInput(request.input, 'minYears', 'Minimum years of experience is required.'),
          minDegree: requireDegreeInput(request.input, 'minDegree'),
          requiredSkills: requireStringArrayInput(request.input, 'requiredSkills'),
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return {
          ...success('Resume screening created', '筛查单已创建'),
          data: { screeningId: result.id, title: result.title, status: result.status }
        }
      }

      if (actionKey === 'update_screening') {
        const result = await this.service.updateScreening(scope, {
          screeningId: requireScreeningId(request),
          baseVersion: requireStringInput(request.input, 'baseVersion', 'Screening edit version is required.'),
          title: requireStringInput(request.input, 'title', 'Screening title is required.'),
          jobTitle: requireStringInput(request.input, 'jobTitle', 'Job title is required.'),
          jdText: requireStringInput(request.input, 'jdText', 'JD text is required.'),
          minYears: requireNumberInput(request.input, 'minYears', 'Minimum years is required.'),
          minDegree: requireDegreeInput(request.input, 'minDegree'),
          requiredSkills: requireStringArrayInput(request.input, 'requiredSkills')
        })
        return { ...success('Screening updated', '筛查单已更新'),
          data: { screeningId: result.id, title: result.title } }
      }

      if (actionKey === 'add_candidate') {
        const result = await this.service.addCandidate(scope, {
          requestId: getStringInput(request.input, 'requestId'),
          screeningId: requireScreeningId(request),
          name: requireStringInput(request.input, 'name', 'Candidate name is required.'),
          yearsOfExperience: requireNumberInput(request.input, 'yearsOfExperience', 'Years of experience is required.'),
          degree: requireDegreeInput(request.input, 'degree'),
          skills: requireStringArrayInput(request.input, 'skills'),
          resumeText: requireStringInput(request.input, 'resumeText', 'Resume text is required.')
        })
        return {
          ...success('Candidate added', '候选人已添加'),
          data: { candidateId: result.id, name: result.name }
        }
      }

      if (actionKey === 'confirm_candidate') {
        const decision = requireStringInput(request.input, 'decision', 'Decision is required.')
        if (decision !== 'interview' && decision !== 'pending' && decision !== 'rejected') {
          throw new Error('Decision must be interview, pending, or rejected.')
        }
        const result = await this.service.confirmScreening(scope, {
          screeningId: requireScreeningId(request),
          candidateId: requireStringInput(request.input, 'candidateId', 'Candidate id is required.'),
          decision,
          adjustedTotal: getAdjustmentInput(request.input),
          note: typeof request.input?.['note'] === 'string' ? request.input['note'].trim() : undefined,
          baseRevision: getNumberInput(request.input, 'baseRevision')
        })
        return {
          ...success('Confirmation saved', '确认结论已保存'),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message),
        ...(error instanceof ResumeRevisionConflictError || error instanceof ResumeCriteriaLockedError
          ? { failure: { kind: 'business' as const, code: error.errorCode } }
          : {})
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

  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }

  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): ResumeScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    assistantId: context.hostType === 'agent' ? context.hostId : null,
    userId: context.userId
  }
}

function getActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'xpertId') ?? (context.hostType === 'agent' ? context.hostId : undefined)
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

function requireScreeningId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'screeningId') ??
    getStringParameter(request.parameters, 'screeningId') ??
    requireString(request.targetId, 'Screening id is required.')
  )
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

function requireNumberInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = getNumberInput(input, key)
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getAdjustmentInput(input: XpertViewActionRequest['input']): number | null | undefined {
  const value = input?.['adjustedTotal']
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Adjusted score must be a number, or null to restore the AI score.')
  }
  return value
}

function requireDegreeInput(input: XpertViewActionRequest['input'], key: string): ResumeDegreeLevel {
  const value = getStringInput(input, key)
  if (!value || !(DEGREE_LEVELS as string[]).includes(value)) {
    throw new Error(`Degree must be one of: ${DEGREE_LEVELS.join(', ')}.`)
  }
  return value as ResumeDegreeLevel
}

function requireStringArrayInput(input: XpertViewActionRequest['input'], key: string): string[] {
  const value = input?.[key]
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings.`)
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  if (items.length === 0) {
    throw new Error(`${key} must contain at least one item.`)
  }
  return items
}

function getStringParameter(parameters: XpertViewQuery['parameters'], key: string) {
  const value = parameters?.[key]
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim()
  }
  return undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
