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
  XpertViewDataResult,
  XpertViewDataSource,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_MAIN_SLOT,
  SQL_REVIEW_FEATURE,
  SQL_REVIEW_PLUGIN_NAME,
  SQL_REVIEW_PROVIDER_KEY,
  SQL_REVIEW_REMOTE_ENTRY_KEY,
  SQL_REVIEW_WORKBENCH_VIEW_KEY
} from './constants'
import { SqlReviewService } from './sql-review.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const isSqlReviewViewKey = (key: string) => key === SQL_REVIEW_WORKBENCH_VIEW_KEY

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function getStringParameter(query: XpertViewQuery, name: string): string | undefined {
  const parameters = (query.parameters ?? {}) as Record<string, unknown>
  const value = parameters[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getStringInput(input: unknown, name: string): string | undefined {
  const obj = (input ?? {}) as Record<string, unknown>
  const value = obj[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

@Injectable()
@ViewExtensionProvider(SQL_REVIEW_PROVIDER_KEY)
export class SqlReviewViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SqlReviewService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT) {
      return []
    }
    return [
      {
        key: SQL_REVIEW_WORKBENCH_VIEW_KEY,
        title: text('SQL Review Workbench', 'SQL 质量审查工作台'),
        description: text(
          'Inspect rule and AI findings with evidence, decide each finding, retry failed cases.',
          '查看带证据的规则与 AI 审查发现、逐条确认或驳回、失败重试。'
        ),
        icon: { type: 'font', value: 'ri-file-list-3-line', color: '#1769e0' },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        source: { provider: SQL_REVIEW_PROVIDER_KEY, plugin: SQL_REVIEW_PLUGIN_NAME },
        view: remoteView(),
        dataSource: platformDataSource(),
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'decide_finding', label: text('Decide Finding', '确认/驳回'), placement: 'row', actionType: 'invoke' },
          { key: 'finalize_case', label: text('Finalize Case', '终审提交'), icon: 'ri-check-double-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'retry_case', label: text('Retry AI Review', '重试 AI 审查'), icon: 'ri-restart-line', placement: 'toolbar', actionType: 'invoke' }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (component.entry !== SQL_REVIEW_REMOTE_ENTRY_KEY || !isSqlReviewViewKey(viewKey)) {
      return {
        html: '<!doctype html><html><body>Unsupported sql review component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    try {
      const appPath = join(__dirname, 'remote-components', SQL_REVIEW_REMOTE_ENTRY_KEY, 'app.js')
      const appScript = await readFile(appPath, 'utf8')
      const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
      const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
      return {
        html: renderRemoteReactIframeHtml({
          title: 'SQL 质量审查工作台',
          lang: 'zh-Hans',
          reactUmd,
          reactDomUmd,
          appScript
        }),
        contentType: 'text/html; charset=utf-8'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        html: `<!doctype html><html><body style="font-family:sans-serif;padding:24px">SQL Review UI bundle unavailable: ${message}</body></html>`,
        contentType: 'text/html; charset=utf-8'
      }
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (!isSqlReviewViewKey(viewKey)) {
      return {}
    }
    const scope = scopeFromContext(context)
    const caseNo = getStringParameter(query, 'caseNo')
    try {
      if (caseNo) {
        const snapshot = await this.service.getCaseSnapshot(scope, caseNo)
        return { item: snapshot as unknown, total: 1 }
      }
      const rows = await this.service.listCases(scope, Math.max(1, query.pageSize ?? 20))
      return { items: rows as unknown[], total: rows.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { meta: { error: message } }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (!isSqlReviewViewKey(viewKey)) {
      return failure('Unsupported action', '不支持的操作')
    }
    const scope = scopeFromContext(context)
    const caseNo = getStringInput(request.input, 'caseNo')
    try {
      if (actionKey === 'decide_finding') {
        if (!caseNo) return failure('caseNo is required', '缺少 caseNo')
        const seq = Number(getStringInput(request.input, 'seq'))
        const decision = getStringInput(request.input, 'decision')
        if (decision !== 'accepted' && decision !== 'rejected') {
          return failure('decision must be accepted|rejected', 'decision 取值非法')
        }
        const snapshot = await this.service.decideFinding(
          scope,
          caseNo,
          seq,
          decision,
          context.userId,
          getStringInput(request.input, 'comment')
        )
        return { success: true, message: text('Finding decided', '已记录决策'), refresh: true, data: { snapshot } }
      }
      if (actionKey === 'finalize_case') {
        if (!caseNo) return failure('caseNo is required', '缺少 caseNo')
        const snapshot = await this.service.finalizeCase(scope, caseNo, context.userId)
        return {
          success: true,
          message: text(`Case finalized as ${snapshot.status}`, `审查单已终审：${snapshot.status}`),
          refresh: true,
          data: { snapshot }
        }
      }
      if (actionKey === 'retry_case') {
        if (!caseNo) return failure('caseNo is required', '缺少 caseNo')
        const snapshot = await this.service.retryCase(scope, caseNo)
        return {
          success: true,
          message: text('Case returned to pending_ai; ask the assistant to re-run the review', '已重置为待 AI 审查，请让助手重新分析'),
          refresh: true,
          data: { snapshot }
        }
      }
      return failure(`Unknown action ${actionKey}`, `未知操作 ${actionKey}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return failure(message, message)
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: { isolation: 'iframe' as const, entry: SQL_REVIEW_REMOTE_ENTRY_KEY },
    dataSource: { mode: 'platform' as const }
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
    cache: { enabled: false }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext) {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    assistantId: context.hostId
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans), refresh: false }
}
