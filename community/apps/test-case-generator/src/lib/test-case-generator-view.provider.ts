import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
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
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  TEST_CASE_GENERATOR_FEATURE,
  TEST_CASE_GENERATOR_MIDDLEWARE_TOOL_NAMES,
  TEST_CASE_GENERATOR_PLUGIN_NAME,
  TEST_CASE_GENERATOR_PROVIDER_KEY,
  TEST_CASE_GENERATOR_REMOTE_ENTRY_KEY,
  TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY
} from './constants'
import { TestCaseGeneratorService } from './test-case-generator.service'
import type { TestCaseScope } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(TEST_CASE_GENERATOR_PROVIDER_KEY)
export class TestCaseGeneratorViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TestCaseGeneratorService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [TEST_CASE_GENERATOR_FEATURE]
          },
          workbench: {
            fixed: true
          }
        }
      : {}

    return [
      {
        key: TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY,
        title: text('Test Case Generator Workbench', '测试用例智能生成工作台'),
        description: text(
          'Input requirement text, generate structured test cases with AI, edit, save to library, and browse history.',
          '输入需求描述，AI 生成结构化测试用例，编辑、保存到用例库并浏览历史。'
        ),
        icon: {
          type: 'font',
          value: 'ri-file-list-3-line',
          color: '#1D4ED8'
        },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        ...base,
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Test Case Generator', '测试用例生成'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-file-list-3-line',
                    color: '#1D4ED8'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: TEST_CASE_GENERATOR_PROVIDER_KEY,
          plugin: TEST_CASE_GENERATOR_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'generate_test_cases',
            label: text('Generate Cases', '生成用例'),
            icon: 'ri-magic-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'save_project',
            label: text('Save to Library', '保存到用例库'),
            icon: 'ri-save-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'delete_project',
            label: text('Delete Project', '删除项目'),
            icon: 'ri-delete-bin-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'update_test_case',
            label: text('Update Case', '更新用例'),
            icon: 'ri-edit-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'delete_test_case',
            label: text('Delete Case', '删除用例'),
            icon: 'ri-close-circle-line',
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
    if (component.entry !== TEST_CASE_GENERATOR_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported test case generator component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', TEST_CASE_GENERATOR_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Test Case Generator Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    _viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    return this.service.getViewData(scopeFromContext(context), {
      projectId: getStringParameter(query.parameters, 'projectId'),
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    _viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('View refreshed', '视图已刷新')
      }

      if (actionKey === 'generate_test_cases') {
        return {
          success: true,
          message: text('Use Assistant chat to generate test cases', '请通过 Assistant 对话生成测试用例'),
          refresh: false,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildGenerateAssistantMessage(request.input)
            }
          }
        }
      }

      if (actionKey === 'save_project') {
        const requirementText = getStringInput(request.input, 'requirementText')
        if (!requirementText) {
          return failure('Requirement text is required', '缺少需求描述')
        }
        const granularity = (getStringInput(request.input, 'granularity') ?? 'basic') as 'basic' | 'detailed'
        const testCases = normalizeTestCasesInput(request.input)
        if (!testCases.length) {
          return failure('At least one test case is required', '至少需要一条测试用例')
        }
        const project = await this.service.saveProject({ requirementText, granularity, testCases }, scope)
        return {
          success: true,
          message: text('Project saved to library', '项目已保存到用例库'),
          refresh: true,
          data: { projectId: project.id, testCaseCount: project.testCases?.length ?? 0 }
        }
      }

      const projectId = request.targetId ?? getStringInput(request.input, 'projectId')
      if (!projectId) {
        return failure('Project id is required', '缺少项目 ID')
      }

      if (actionKey === 'delete_project') {
        await this.service.deleteProject(scope, projectId)
        return success('Project deleted', '项目已删除')
      }

      if (actionKey === 'update_test_case') {
        const testCaseId = getStringInput(request.input, 'testCaseId')
        if (!testCaseId) {
          return failure('Test case id is required', '缺少用例 ID')
        }
        await this.service.updateTestCase(scope, projectId, testCaseId, {
          name: getStringInput(request.input, 'name'),
          precondition: getStringInput(request.input, 'precondition'),
          steps: getStringArrayInput(request.input, 'steps'),
          expectedResult: getStringInput(request.input, 'expectedResult'),
          priority: getStringInput(request.input, 'priority') as 'P0' | 'P1' | 'P2' | undefined
        })
        return success('Test case updated', '用例已更新')
      }

      if (actionKey === 'delete_test_case') {
        const testCaseId = getStringInput(request.input, 'testCaseId')
        if (!testCaseId) {
          return failure('Test case id is required', '缺少用例 ID')
        }
        await this.service.deleteTestCase(scope, projectId, testCaseId)
        return success('Test case deleted', '用例已删除')
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

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: TEST_CASE_GENERATOR_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform' as const
    }
  }
}

function platformDataSource(): XpertViewDataSource {
  return {
    mode: 'platform' as const,
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsSort: false,
      supportsFilter: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'test-case-generator-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...TEST_CASE_GENERATOR_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): TestCaseScope {
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

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    return items.length ? items : undefined
  }
  return undefined
}

function normalizeTestCasesInput(input: Record<string, unknown> | null | undefined) {
  const value = input?.testCases
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      name: getStringInput(item, 'name') ?? '',
      precondition: getStringInput(item, 'precondition') ?? '',
      steps: getStringArrayInput(item, 'steps') ?? [],
      expectedResult: getStringInput(item, 'expectedResult') ?? '',
      priority: (getStringInput(item, 'priority') ?? 'P1') as 'P0' | 'P1' | 'P2'
    }))
    .filter((item) => item.name && item.steps.length)
}

function buildGenerateAssistantMessage(input: Record<string, unknown> | null | undefined) {
  const requirementText = getStringInput(input, 'requirementText') ?? ''
  const granularity = getStringInput(input, 'granularity') ?? 'basic'
  return [
    '请根据以下需求描述生成测试用例。',
    '你必须调用 test_case_generate 工具来生成结构化测试用例。',
    '生成的用例必须覆盖正常流程、异常流程和边界条件三类场景，并自动划分 P0/P1/P2 优先级。',
    '如果需求描述不足 20 字或语义模糊，请返回 INVALID_INPUT 错误，不要强制生成。',
    '',
    `需求描述：${requirementText}`,
    `粒度：${granularity}`
  ].join('\n')
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

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback
}
