import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider,
} from '@xpert-ai/plugin-sdk'
import type {
  XpertResolvedViewHostContext,
  XpertViewQuery,
  XpertExtensionViewManifest,
  XpertRemoteComponentViewSchema,
  XpertViewActionRequest,
  XpertViewDataResult,
} from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { ProjectPipelinesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { nodeWorkbench } from './node-workbench.js'
import { MotorEvolution } from './evolution.js'
import { MotorWork } from './entity.js'
import { MotorRuntime } from './runtime.js'
import { views, provider, t, name, variants, flow, agentKey, middleware } from './process.js'
import { workbench, icon } from './catalog.js'
import { pending, status } from './domain.js'
import { project, type WorkbenchData } from './projection.js'
const uuid = z.string().uuid(),
  node = z.enum(flow.map((x) => x.key) as [(typeof flow)[number]['key'], ...(typeof flow)[number]['key'][]])
const base = z.object({ caseId: uuid, operation: uuid })
const inputs = {
  evolve: base.extend({ reason: z.string().trim().min(1).max(500) }).strict(),
  create: z
    .object({
      mode: z.enum(['rehearsal', 'pipeline']),
      variant: z.enum(variants).optional(),
      operation: uuid,
    })
    .strict(),
  next: base.strict(),
  start: base.strict(),
  run: base.extend({ node }).strict(),
  review: base
    .extend({
      node,
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().min(1).max(500),
      plan: z.enum(['expedite', 'split', 'original']).optional(),
    })
    .strict(),
}
function access(c: XpertResolvedViewHostContext) {
  if (!c.tenantId || !c.organizationId || !c.userId || c.hostType !== 'agent')
    throw new ForbiddenException('organization_user_required')
  return {
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    userId: c.userId,
  }
}
function coordinator(c: XpertResolvedViewHostContext) {
  return z.object({ agent: z.object({ key: z.literal(agentKey('coordinator')) }) }).safeParse(c.hostSnapshot)
    .success
}
function surface(key: string) {
  if (key === views.workspace) return 'workspace'
  if (key === views.dashboard) return 'dashboard'
  throw Error('unsupported_view')
}
const titles = {
  dashboard: t('Order portfolio', '电机订单总览'),
  workspace: t('Order evidence and approvals', '订单流程与审批'),
}
@Injectable()
@ViewExtensionProvider(provider)
export class MotorViews implements IXpertViewExtensionProvider {
  constructor(private api: MotorRuntime, private evolution: MotorEvolution) {}
  supports(c: XpertResolvedViewHostContext) {
    return c.hostType === 'agent'
  }
  getViewManifests(c: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(c) || !['agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    return (['dashboard', 'workspace'] as const).map((s, i) => ({
      key: views[s],
      title: titles[s],
      hostType: 'agent',
      slot,
      order: i * 10,
      icon,
      refreshable: true,
      activation: { requiredFeatures: [workbench] },
      ...(slot === 'agent.workbench.fixed'
        ? {
            workbench: {
              fixed: true,
              menu: { enabled: true, label: titles[s], order: i * 10, icon },
            },
          }
        : {}),
      source: { provider, plugin: name },
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: 'motor' },
        dataSource: { mode: 'platform' },
      },
      dataSource: {
        mode: 'platform',
        querySchema: { supportsSelection: true, supportsParameters: true },
        cache: { enabled: false },
      },
      clientCommands: [
        {
          key: 'workbench.navigation.open',
          label: t('Inspect order or execution', '查看订单或执行记录'),
        },
      ],
      actions: Object.keys(inputs).map((key) => ({
        key,
        label: t(key, key),
        actionType: 'invoke',
      })),
    }))
  }
  async getRemoteComponentEntry(
    c: XpertResolvedViewHostContext,
    key: string,
    component: XpertRemoteComponentViewSchema['component'],
  ) {
    surface(key)
    if (component.entry !== 'motor') throw Error('invalid_entry')
    const req = createRequire(import.meta.url)
    const umd = (p: string) =>
      readFile(join(dirname(req.resolve(p + '/package.json')), 'umd', p + '.production.min.js'), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(new URL('./remote/app.js', import.meta.url), 'utf8'),
      readFile(new URL('./remote/app.css', import.meta.url), 'utf8'),
      umd('react'),
      umd('react-dom'),
    ])
    return {
      contentType: 'text/html; charset=utf-8' as const,
      html: renderRemoteReactIframeHtml({
        title: 'EV Motor Lifecycle',
        lang: c.locale ?? 'zh-Hans',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd,
      }),
    }
  }
  async getViewData(
    c: XpertResolvedViewHostContext,
    key: string,
    q: XpertViewQuery,
  ): Promise<WorkbenchData & XpertViewDataResult> {
    const s = access(c),
      rows = await this.api.store.list(s),
      e = q.selectionId ? await this.api.store.get(s, uuid.parse(q.selectionId)) : rows[0]
    const orders = rows.map((x) => ({
        id: x.id,
        code: x.data.code,
        status: status(x.data),
      })),
      counts = { active: 0, waiting: 0, complete: 0, rejected: 0 }
    for (const item of rows) counts[status(item.data)]++
    const attempts = e?.instanceId
      ? await this.api.store.db.getRepository(MotorWork).findBy({
          caseId: e.id,
          organizationId: s.organizationId,
          tenantId: s.tenantId,
        })
      : []
    const workspace = e && surface(key) === 'workspace'
    const graph =
      workspace && e.instanceId
        ? await this.api.caps
            .require(ProjectPipelinesRuntimeCapability)
            .graph({ actor: s, projectId: e.projectId }, e.instanceId, {
              roundId: uuid.optional().parse(q.parameters?.pipelineRoundId),
            })
        : undefined
    return {
      desks: workspace ? nodeWorkbench(e.data, graph) : undefined,
      attempts: attempts.map((w) => ({
        node: w.node,
        executionId: w.executionId,
        conversationId: w.conversationId,
        assistantId: w.assistantId,
        submitted: !!w.assessment,
      })),
      surface: surface(key),
      canCreate: coordinator(c),
      orders,
      counts,
      selected: e ? project(e.data) : null,
      instanceId: e?.instanceId,
      projectId: e?.projectId,
      roleBindings: e?.assistants,
      ownerId: e?.ownerId,
      evolution: e?.changeId
        ? {
            changeId: e.changeId,
            version: e.evolutionReceipt?.resource.version ?? null,
          }
        : null,
    }
  }
  async executeViewAction(
    c: XpertResolvedViewHostContext,
    key: string,
    action: string,
    request: XpertViewActionRequest,
  ) {
    surface(key)
    const s = access(c)
    if (!coordinator(c)) throw new ForbiddenException('coordinator_workbench_required')
    let id: string
    if (action === 'create') {
      const i = inputs.create.parse(request.input)
      id = (await this.api.store.create(s, c.hostId, i.operation, i.mode, undefined, i.variant)).id
    } else {
      const i = base.parse(request.input),
        e = await this.api.store.get(s, i.caseId)
      id = e.id
      if (e.coordinatorId !== c.hostId) throw new ForbiddenException('coordinator_mismatch')
      if (action === 'next') {
        inputs.next.parse(request.input)
        id = (await this.api.store.create(s, c.hostId, i.operation, e.data.mode, e.id)).id
      } else if (action === 'start') {
        inputs.start.parse(request.input)
        await this.api.start(s, id)
      } else if (action === 'evolve') {
        const r = inputs.evolve.parse(request.input)
        if (e.data.mode !== 'pipeline' || e.data.rule !== 'R1' || pending(e.data)?.key !== 'publish')
          throw Error('publish_gate_required')
        await this.evolution.decide(s, id, true, r.reason)
      } else if (action === 'run') {
        const r = inputs.run.parse(request.input),
          step = flow.find((x) => x.key === r.node)
        if (e.data.mode !== 'rehearsal' || step?.kind !== 'assistant')
          throw Error('sample_assistant_required')
        await this.api.store.apply(
          s,
          id,
          { node: r.node, operation: r.operation },
          { kind: 'sample_assistant', id: middleware(step.role) },
        )
        if (r.node === 'replay' && e.data.rule === 'R1') await this.evolution.propose(s, id)
      } else if (action === 'review') {
        const r = inputs.review.parse(request.input)
        if (e.data.mode !== 'rehearsal') throw Error('use_project_approval')
        if (
          e.data.rule === 'R1' &&
          r.node === 'publish' &&
          (pending(e.data)?.key === 'publish' ||
            e.data.events.some((x) => x.node === 'publish' && x.operation === r.operation))
        )
          await this.evolution.decide(s, id, r.decision === 'approve', r.reason)
        await this.api.store.apply(
          s,
          id,
          {
            node: r.node,
            operation: r.operation,
            decision: r.decision,
            plan: r.plan,
            reason: r.reason,
          },
          { kind: 'human', id: s.userId },
        )
      } else throw Error('unknown_action')
    }
    return {
      success: true,
      refresh: true,
      data: { caseId: id },
      message: t('Saved', '已保存'),
    }
  }
}
