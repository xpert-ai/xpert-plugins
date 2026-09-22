import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { z } from 'zod/v3'
import {
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import type {
  XpertResolvedViewHostContext,
  XpertExtensionViewManifest,
  XpertViewQuery,
  XpertViewActionRequest,
  XpertViewActionResult
} from '@xpert-ai/contracts'
import { FEATURE, ICON, PLUGIN_NAME, PROVIDER, TOOLS, VIEW } from './constants'
import { ReviewError, scopeSchema, readSchema } from './contracts'
import { ReviewService } from './service'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const scope = (c: XpertResolvedViewHostContext) =>
  scopeSchema.parse({
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    userId: c.userId,
    assistantId: c.hostId
  })
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class ReviewView implements IXpertViewExtensionProvider {
  constructor(private readonly service: ReviewService) {}
  supports(c: XpertResolvedViewHostContext) {
    return c.hostType === 'agent'
  }
  getViewManifests(
    _c: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (slot !== 'agent.workbench.fixed' && slot !== 'agent.workbench.main')
      return []
    return [
      {
        key: VIEW,
        title: text('Admission review', '准入资料核验'),
        hostType: 'agent',
        slot,
        icon: ICON,
        source: { provider: PROVIDER, plugin: PLUGIN_NAME },
        activation: { requiredFeatures: [FEATURE] },
        workbench: {
          fixed: true,
          menu: {
            enabled: true,
            label: text('Admission review', '准入核验'),
            icon: ICON
          }
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { entry: VIEW, isolation: 'iframe' },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: { enabled: false }
        },
        refreshable: true,
        actions: ['create', 'start', 'confirm', 'dispatch_failed'].map(
          (action) => ({
            key: action,
            label: text(
              action,
              {
                create: '保存资料',
                start: '开始提取',
                confirm: '确认保存',
                dispatch_failed: '记录发送失败'
              }[action] ?? action
            ),
            actionType: 'invoke' as const
          })
        ),
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to assistant', '交给助手提取')
          }
        ],
        hostEvents: {
          subscriptions: [
            {
              key: VIEW + '.updated',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [TOOLS.save, TOOLS.fail]
              },
              action: { type: 'forward', debounceMs: 300 }
            }
          ]
        }
      }
    ]
  }
  async getViewData(
    c: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ) {
    if (viewKey !== VIEW) throw new ReviewError('not_found')
    const id = query.parameters?.id
    if (typeof id === 'string')
      return {
        item: await this.service.detail(scope(c), z.string().uuid().parse(id))
      }
    return this.service.list(
      scope(c),
      z
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(query.page ?? 1)
    )
  }
  async executeViewAction(
    c: XpertResolvedViewHostContext,
    viewKey: string,
    action: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW) throw new ReviewError('not_found')
      const identity = scope(c)
      if (action === 'create')
        return {
          success: true,
          data: await this.service.create(identity, request.input),
          refresh: true
        }
      if (action === 'confirm')
        return {
          success: true,
          data: await this.service.confirm(identity, request.input),
          refresh: true
        }
      if (action === 'start') {
        const row = await this.service.start(identity, request.input)
        return {
          success: true,
          data: {
            ...row,
            commandKey: 'assistant.chat.send_message',
            payload: {
              newThread: true,
              text: `请核验准入资料。attemptId=${row.attemptId}。先调用 ${TOOLS.read} 读取原文，再调用 ${TOOLS.save} 保存三个指标的候选及原文证据。不要确认，不要评分。`
            }
          },
          refresh: true
        }
      }
      if (action === 'dispatch_failed') {
        const input = readSchema.parse(request.input)
        return {
          success: true,
          data: await this.service.failAttempt(
            identity,
            input.attemptId,
            'dispatch_failed'
          ),
          refresh: true
        }
      }
      throw new ReviewError('not_found')
    } catch (error) {
      return {
        success: false,
        data: {
          errorCode:
            error instanceof ReviewError
              ? error.code
              : error instanceof z.ZodError
              ? 'invalid_input'
              : 'operation_failed'
        }
      }
    }
  }
  async getRemoteComponentEntry(
    _c: XpertResolvedViewHostContext,
    viewKey: string
  ) {
    if (viewKey !== VIEW) throw new ReviewError('not_found')
    const assets = join(__dirname, '../remote')
    const [appScript, appCss] = await Promise.all([
      readFile(join(assets, 'app.js'), 'utf8'),
      readFile(join(assets, 'app.css'), 'utf8')
    ])
    const packageFile = (name: string, file: string) =>
      readFile(
        join(dirname(require.resolve(name + '/package.json')), file),
        'utf8'
      )
    const [reactUmd, reactDomUmd] = await Promise.all([
      packageFile('react', 'umd/react.production.min.js'),
      packageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Admission review',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd
      }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
}
