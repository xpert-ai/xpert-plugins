import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  type JsonSchemaObjectType,
  type XpertExtensionViewManifest,
  type XpertResolvedViewHostContext,
  type XpertViewQuery,
  type XpertViewActionRequest,
  type XpertViewActionResult,
  type XpertRemoteComponentViewSchema
} from '@xpert-ai/contracts'
import { ReviewService, type ReviewDetail } from './services/review.service.js'
import { ReviewError, confirmationProblems } from './domain/policy.js'
import { InputError } from './domain/source.js'
import { editableDraftSchema } from './domain/contracts.js'
import { buildReviewAudit } from './domain/audit.js'
import type { AnalysisAttempt } from './entities/analysis-attempt.entity.js'
import {
  FEATURE,
  ICON,
  PLUGIN_NAME,
  PROVIDER,
  VIEW,
  TOOLS
} from './constants.js'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const identity = z
  .object({
    reviewId: z.string().uuid(),
    expectedVersion: z.number().int().positive()
  })
  .strict()
const identityProperties = {
  reviewId: { type: 'string' as const, format: 'uuid' },
  expectedVersion: { type: 'integer' as const, minimum: 1 }
}
const sourceProperties = {
  title: { type: 'string' as const, minLength: 1, maxLength: 80 },
  sourceText: { type: 'string' as const, minLength: 1, maxLength: 12000 }
}
const evidenceJson: JsonSchemaObjectType = {
  type: 'object',
  additionalProperties: false,
  required: ['segmentId', 'quote'],
  properties: {
    segmentId: { type: 'string', pattern: '^S\\d{2,3}$' },
    quote: { type: 'string', minLength: 1, maxLength: 2000 }
  }
}
const acceptanceJson: JsonSchemaObjectType = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'basis'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 1000 },
    basis: { type: 'string', enum: ['source', 'proposal'] }
  }
}
const cardJson: JsonSchemaObjectType = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'included',
    'title',
    'description',
    'evidence',
    'acceptance',
    'openQuestions'
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    included: { type: 'boolean' },
    title: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    evidence: { type: 'array', minItems: 1, maxItems: 3, items: evidenceJson },
    acceptance: { type: 'array', maxItems: 5, items: acceptanceJson },
    openQuestions: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string', minLength: 1, maxLength: 1000 }
    }
  }
}
const jsonSchemas: Record<string, JsonSchemaObjectType> = {
  create: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'sourceText'],
    properties: sourceProperties
  },
  revise: {
    type: 'object',
    additionalProperties: false,
    required: ['reviewId', 'expectedVersion', 'title', 'sourceText'],
    properties: { ...identityProperties, ...sourceProperties }
  },
  start: {
    type: 'object',
    additionalProperties: false,
    required: ['reviewId', 'expectedVersion', 'requestKey'],
    properties: {
      ...identityProperties,
      requestKey: { type: 'string', format: 'uuid' }
    }
  },
  save: {
    type: 'object',
    additionalProperties: false,
    required: ['reviewId', 'expectedVersion', 'draft'],
    properties: {
      ...identityProperties,
      draft: {
        type: 'object',
        additionalProperties: false,
        required: ['requirements'],
        properties: {
          requirements: { type: 'array', maxItems: 8, items: cardJson }
        }
      }
    }
  },
  confirm: {
    type: 'object',
    additionalProperties: false,
    required: ['reviewId', 'expectedVersion'],
    properties: identityProperties
  },
  dispatch_failed: {
    type: 'object',
    additionalProperties: false,
    required: ['reviewId', 'attemptId'],
    properties: {
      reviewId: { type: 'string', format: 'uuid' },
      attemptId: { type: 'string', format: 'uuid' }
    }
  }
}
export const actionSchemas = {
  create: z
    .object({
      title: z.string().trim().min(1).max(80),
      sourceText: z.string().min(1).max(12000)
    })
    .strict(),
  revise: identity
    .extend({
      title: z.string().trim().min(1).max(80),
      sourceText: z.string().min(1).max(12000)
    })
    .strict(),
  start: identity.extend({ requestKey: z.string().uuid() }).strict(),
  save: identity.extend({ draft: editableDraftSchema }).strict(),
  confirm: identity,
  dispatch_failed: z
    .object({ reviewId: z.string().uuid(), attemptId: z.string().uuid() })
    .strict()
}
function publicAttempt(attempt: AnalysisAttempt) {
  const startedAt = Date.parse(attempt.startedAt)
  const completedAt = attempt.completedAt
    ? Date.parse(attempt.completedAt)
    : Number.NaN
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(completedAt)
      ? Math.max(0, completedAt - startedAt)
      : null
  const model = attempt.model
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const usage =
    attempt.usage &&
    Number.isFinite(attempt.usage.inputTokens) &&
    Number.isFinite(attempt.usage.outputTokens)
      ? {
          inputTokens: Math.max(0, Math.floor(attempt.usage.inputTokens)),
          outputTokens: Math.max(0, Math.floor(attempt.usage.outputTokens))
        }
      : null
  return {
    id: attempt.id,
    inputVersion: attempt.inputVersion,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    completedAt: attempt.completedAt,
    durationMs,
    model: model || null,
    promptVersion: attempt.promptVersion,
    errorCode: attempt.errorCode,
    usage
  }
}
export function publicDetail({ review, attempt, attempts }: ReviewDetail) {
  return {
    id: review.id,
    title: review.title,
    sourceText: review.sourceText,
    sourceSegments: review.sourceSegments,
    status: review.status,
    version: review.version,
    inputVersion: review.inputVersion,
    aiDraft: review.aiDraft,
    editableDraft: review.editableDraft,
    confirmedSnapshot: review.confirmedSnapshot
      ? {
          draft: review.confirmedSnapshot.draft,
          confirmedAt: review.confirmedSnapshot.confirmedAt,
          sourceVersion: review.confirmedSnapshot.sourceVersion
        }
      : null,
    confirmedAt: review.confirmedAt,
    updatedAt: review.updatedAt,
    blockers: review.editableDraft
      ? confirmationProblems(review.editableDraft)
      : [],
    audit: buildReviewAudit(
      review.aiDraft,
      review.editableDraft,
      review.confirmedSnapshot
    ),
    attempt: attempt ? publicAttempt(attempt) : null,
    attempts: attempts.map(publicAttempt)
  }
}
const scopeOf = (context: XpertResolvedViewHostContext) => ({
  tenantId: context.tenantId ?? null,
  organizationId: context.organizationId ?? null,
  userId: context.userId
})
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class ReviewViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly reviews: ReviewService) {}
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }
  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (!['agent.workbench.main', 'agent.workbench.fixed'].includes(slot))
      return []
    return [
      {
        key: VIEW,
        title: text('ReqTrace review', 'ReqTrace 需求评审'),
        icon: ICON,
        hostType: context.hostType,
        slot,
        order: 30,
        refreshable: true,
        activation: { requiredFeatures: [FEATURE] },
        ...(slot === 'agent.workbench.fixed'
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Requirements', '需求评审'),
                  order: 30,
                  icon: ICON
                }
              }
            }
          : {}),
        source: { provider: PROVIDER, plugin: PLUGIN_NAME },
        parameters: [
          { key: 'reviewId', type: 'string', label: text('Review', '评审') }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: VIEW },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: { enabled: false }
        },
        clientCommands: [
          {
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: text('Analyze source', '分析原文')
          }
        ],
        actions: Object.keys(actionSchemas).map((key) => ({
          key,
          label: text(
            key,
            (
              {
                create: '创建评审',
                revise: '修改原文',
                start: '开始分析',
                save: '保存草稿',
                confirm: '确认保存',
                dispatch_failed: '报告发送失败'
              } as Record<string, string>
            )[key]
          ),
          actionType: 'invoke' as const,
          inputSchema: jsonSchemas[key]
        }))
      }
    ]
  }
  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ) {
    if (viewKey !== VIEW || component.entry !== VIEW)
      throw new ReviewError('not_found')
    const root = new URL('./remote/', import.meta.url)
    const [appScript, appCss] = await Promise.all([
      readFile(fileURLToPath(new URL('app.js', root)), 'utf8'),
      readFile(fileURLToPath(new URL('app.css', root)), 'utf8')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'ReqTrace review',
        lang: 'zh-CN',
        reactUmd: '',
        reactDomUmd: '',
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ) {
    if (viewKey !== VIEW) throw new ReviewError('not_found')
    const scope = scopeOf(context)
    const list = await this.reviews.list(scope, query.page, query.search)
    const parameter = query.parameters?.reviewId
    const id =
      typeof parameter === 'string' &&
      z.string().uuid().safeParse(parameter).success
        ? parameter
        : undefined
    const detail = id ? publicDetail(await this.reviews.get(scope, id)) : null
    return {
      items: list.items,
      total: list.total,
      meta: {
        ...list,
        detail,
        sendCommand: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND
      }
    }
  }
  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== VIEW) throw new ReviewError('not_found')
    const scope = scopeOf(context)
    try {
      let data: Record<string, unknown>
      if (actionKey === 'create')
        data = await this.reviews.create(
          scope,
          actionSchemas.create.parse(request.input)
        )
      else if (actionKey === 'revise') {
        const input = actionSchemas.revise.parse(request.input)
        data = await this.reviews.reviseSource(scope, {
          ...input,
          version: input.expectedVersion
        })
      } else if (actionKey === 'start') {
        const input = actionSchemas.start.parse(request.input)
        const result = await this.reviews.start(scope, {
          ...input,
          version: input.expectedVersion
        })
        data = {
          ...result,
          ...(result.dispatch
            ? {
                clientCommand: {
                  commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
                  payload: {
                    text: `请分析 ReqTrace 评审 reviewId=${result.reviewId}，attemptId=${result.attemptId}。先调用 ${TOOLS.read} 读取原文与 inputVersion，再调用 ${TOOLS.submit} 提交完整草稿。只提取原文支持的需求，证据使用对应分段的连续原文摘录。验收条件区分 source 与 proposal，未明确的内容列入 openQuestions，不虚构数字、期限或负责人。失败时调用 ${TOOLS.fail}。完成后提示我到需求评审工作台核对。`
                  }
                }
              }
            : {})
        }
      } else if (actionKey === 'save') {
        const input = actionSchemas.save.parse(request.input)
        data = await this.reviews.saveDraft(scope, {
          reviewId: input.reviewId,
          version: input.expectedVersion,
          draft: input.draft
        })
      } else if (actionKey === 'confirm') {
        const input = actionSchemas.confirm.parse(request.input)
        const result = await this.reviews.confirm(scope, {
          reviewId: input.reviewId,
          version: input.expectedVersion
        })
        data = {
          reviewId: input.reviewId,
          confirmedAt: result.snapshot?.confirmedAt
        }
      } else if (actionKey === 'dispatch_failed') {
        const input = actionSchemas.dispatch_failed.parse(request.input)
        data = await this.reviews.fail(scope, {
          ...input,
          code: 'dispatch_failed'
        })
      } else throw new ReviewError('invalid_input')
      return { success: true, refresh: true, data }
    } catch (error) {
      return {
        success: false,
        refresh: false,
        data: {
          code:
            error instanceof ReviewError || error instanceof InputError
              ? error.code
              : error instanceof z.ZodError
                ? 'invalid_input'
                : 'model_failed'
        },
        message: text(
          'The operation could not be completed.',
          '操作未完成，请检查输入或刷新后重试。'
        )
      }
    }
  }
}
