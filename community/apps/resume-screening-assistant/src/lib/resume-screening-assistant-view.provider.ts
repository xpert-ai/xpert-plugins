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
  PROJECT_DETAIL_SECTIONS_SLOT,
  RESUME_SCREENING_ASSISTANT_FEATURE,
  RESUME_SCREENING_ASSISTANT_ICON,
  RESUME_SCREENING_ASSISTANT_PLUGIN_NAME,
  RESUME_SCREENING_ASSISTANT_PROVIDER_KEY,
  RESUME_SCREENING_ASSISTANT_REMOTE_ENTRY_KEY,
  RESUME_SCREENING_ASSISTANT_VIEW_KEY
} from './constants.js'
import { ResumeScreeningAssistantService } from './resume-screening-assistant.service.js'
import type { ResumeScreeningScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(RESUME_SCREENING_ASSISTANT_PROVIDER_KEY)
export class ResumeScreeningAssistantViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ResumeScreeningAssistantService) {}

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
        key: RESUME_SCREENING_ASSISTANT_VIEW_KEY,
        title: text('Resume Screening Assistant', '简历初筛助手'),
        description: text(
          'Create jobs, import resumes, run AI screening, and review sorted candidate recommendations.',
          '创建岗位、导入简历、运行 AI 初筛，并复核按分数排序的候选人建议。'
        ),
        icon: {
          type: 'svg',
          value: RESUME_SCREENING_ASSISTANT_ICON
        },
        hostType: context.hostType,
        slot,
        order: 35,
        refreshable: true,
        activation: {
          requiredFeatures: [RESUME_SCREENING_ASSISTANT_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Resume Screening', '简历初筛'),
                  order: 35,
                  icon: {
                    type: 'svg',
                    value: RESUME_SCREENING_ASSISTANT_ICON,
                    alt: 'Resume Screening'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: RESUME_SCREENING_ASSISTANT_PROVIDER_KEY,
          plugin: RESUME_SCREENING_ASSISTANT_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: RESUME_SCREENING_ASSISTANT_REMOTE_ENTRY_KEY
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
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
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
            key: 'create_screening_job',
            label: text('New Job', '新建岗位'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'add_candidate_resume',
            label: text('Add Resume', '添加简历'),
            icon: 'ri-file-text-line',
            actionType: 'invoke'
          },
          {
            key: 'start_resume_analysis',
            label: text('Start AI Screening', '开始 AI 初筛'),
            icon: 'ri-sparkling-line',
            actionType: 'invoke'
          },
          {
            key: 'retry_candidate_analysis',
            label: text('Retry Candidate', '重试候选人'),
            icon: 'ri-restart-line',
            actionType: 'invoke'
          },
          {
            key: 'update_reviewer_decision',
            label: text('Save Review Decision', '保存复核结论'),
            icon: 'ri-check-line',
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
    if (viewKey !== RESUME_SCREENING_ASSISTANT_VIEW_KEY || component.entry !== RESUME_SCREENING_ASSISTANT_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', RESUME_SCREENING_ASSISTANT_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Resume Screening Assistant',
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
    if (viewKey !== RESUME_SCREENING_ASSISTANT_VIEW_KEY) {
      return {}
    }

    return this.service.getWorkbenchData(scopeFromContext(context), {
      jobId: getStringParameter(query.parameters, 'jobId') ?? query.selectionId,
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
    if (viewKey !== RESUME_SCREENING_ASSISTANT_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Resume screening view refreshed', '简历初筛视图已刷新')
      }

      if (actionKey === 'create_screening_job') {
        const result = await this.service.createScreeningJob(scope, {
          title: requireStringInput(request.input, 'title', 'Job title is required.'),
          jd: requireStringInput(request.input, 'jd', 'Job description is required.'),
          mustHaveSkills: getStringListInput(request.input, 'mustHaveSkills'),
          niceToHaveSkills: getStringListInput(request.input, 'niceToHaveSkills'),
          minYearsExperience: getNumberInput(request.input, 'minYearsExperience'),
          screeningNotes: getStringInput(request.input, 'screeningNotes'),
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return { ...success('Screening job created', '岗位已创建'), data: result }
      }

      if (actionKey === 'add_candidate_resume') {
        const jobId = requireJobId(request)
        const result = await this.service.addCandidate(scope, {
          jobId,
          sourceName: getStringInput(request.input, 'sourceName') ?? 'pasted-resume.txt',
          rawText: requireStringInput(request.input, 'rawText', 'Resume text is required.')
        })
        return { ...success('Candidate resume added', '候选人简历已添加'), data: result }
      }

      if (actionKey === 'start_resume_analysis') {
        const jobId = requireJobId(request)
        const result = await this.service.prepareResumeAnalysisMessages(scope, {
          jobId,
          candidateId: getStringInput(request.input, 'candidateId'),
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return {
          ...success('Resume analysis messages prepared', '简历分析任务已准备'),
          data: result,
          refresh: false
        }
      }

      if (actionKey === 'retry_candidate_analysis') {
        const jobId = requireJobId(request)
        const result = await this.service.retryCandidate(
          scope,
          jobId,
          requireStringInput(request.input, 'candidateId', 'Candidate id is required.')
        )
        return { ...success('Candidate retry queued', '候选人已重新进入待分析状态'), data: result }
      }

      if (actionKey === 'update_reviewer_decision') {
        const jobId = requireJobId(request)
        const result = await this.service.updateReviewerDecision(scope, {
          jobId,
          candidateId: requireStringInput(request.input, 'candidateId', 'Candidate id is required.'),
          reviewerDecision: getReviewerDecisionInput(request.input, 'reviewerDecision'),
          reviewerScore: getNumberInput(request.input, 'reviewerScore'),
          reviewerNote: getStringInput(request.input, 'reviewerNote'),
          summaryOverride: getStringInput(request.input, 'summaryOverride')
        })
        return { ...success('Review decision saved', '复核结论已保存'), data: result }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
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

  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }

  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): ResumeScreeningScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
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

function requireJobId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'jobId') ??
    getStringParameter(request.parameters, 'jobId') ??
    requireString(request.targetId, 'Screening job id is required.')
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

function getStringListInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getReviewerDecisionInput(input: XpertViewActionRequest['input'], key: string) {
  const value = getStringInput(input, key)
  return value === 'interview' || value === 'hold' || value === 'reject' ? value : undefined
}

function getStringParameter(
  parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'] | undefined,
  key: string
) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
