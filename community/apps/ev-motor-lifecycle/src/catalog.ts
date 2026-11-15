import { stringify } from 'yaml'
import { XpertTypeEnum, type PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { roles, agentKey, templateKey, middleware, name, views, t, type Role } from './process.js'
export const keys = Object.keys(roles) as Role[]
export const workbench = 'ev_motor_workbench'
export const icon = { type: 'emoji' as const, value: '⚙️' }
export const avatars: Record<Role, string> = {
  coordinator: '1f9ed',
  sales: '1f4e5',
  engineering: '1f4d0',
  purchasing: '1f4e6',
  planner: '1f5d3',
  production: '1f3ed',
  quality: '1f50e',
  service: '1f527',
}
export const templates: XpertTemplateContribution[] = keys.map((r, order) => {
  const key = templateKey(r),
    agent = agentKey(r),
    title = roles[r],
    leader = r === 'coordinator',
    mw = middleware(r),
    mk = 'Middleware_motor_' + r
  const avatar = { emoji: { id: r, unified: avatars[r] }, background: 'rgb(229,242,239)' }
  const description = leader
    ? '协调电机订单，查看证据与待审批节点。'
    : title + '仅对本角色获派的样例订单任务提交研判。'
  const questions = [leader ? '当前有哪些电机订单在等待审核？' : '本节点的样例证据支持什么结论？']
  const prompt = leader
    ? '使用 ev_motor_coordinator_read 查询当前账号的演示订单。引导用户从工作台创建样例或启动项目流水线。审批必须由真人提交。'
    : '只处理项目流水线明确派发给你的节点。核对样例证据，用中文概括差异、依据与交接事项。仅用 ' +
      mw +
      '_submit 提交一次，使用任务提供的 operationId。未收到已绑定任务时仅解释职责。'
  const dsl = {
    team: {
      name: key,
      title,
      type: 'agent',
      description,
      avatar,
      version: '1',
      agent: { key: agent },
      copilotModel: null,
      options: {
        templateKey: key,
        workspaceScope: { mode: 'project-preferred' },
        workbench: {
          initialLayout: 'workbench-maximized',
          defaultViewKey: leader ? views.dashboard : views.workspace,
        },
      },
      features: { opener: { enabled: true, message: '', questions } },
      knowledgebases: [],
      toolsets: [],
      tags: [],
    },
    nodes: [
      {
        type: 'agent',
        key: agent,
        position: { x: 300, y: 50 },
        entity: {
          key: agent,
          name: mw,
          title,
          description,
          avatar,
          prompt,
          parameters: [],
          leaderKey: null,
          copilotModel: null,
          options: { middlewares: { order: [mk] }, parallelToolCalls: false },
        },
      },
      {
        type: 'workflow',
        key: mk,
        position: { x: 300, y: 350 },
        entity: { key: mk, type: 'middleware', provider: mw, required: true, title },
      },
    ],
    connections: [{ type: 'workflow', key: agent + '/' + mk, from: agent, to: mk, required: true }],
  }
  return {
    key,
    name: key,
    title,
    description,
    avatar,
    category: 'Manufacturing',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: { types: ['assistant-template'], capabilities: [mw, workbench], requiredPlugins: [name] },
    },
    dslContent: stringify(dsl),
    startPrompts: questions,
    order,
    default: leader,
    dependencies: { plugins: [name] },
    primaryAgentKey: agent,
  }
})
export const suiteRoles = keys
  .filter((r) => r !== 'coordinator')
  .map((key) => ({
    key,
    templateKey: templateKey(key),
    name: templateKey(key),
    title: roles[key],
    primaryAgentKey: agentKey(key),
  }))
export const app = {
  type: 'app',
  name: 'ev-motor-lifecycle',
  displayName: t('EV motor lifecycle', '驱动电机制造全流程'),
  description: t(
    'Follow a sample motor from contract to field feedback.',
    '跟随一台驱动电机，从合同原文到实装、返修和下一单规则。',
  ),
  color: '#17645E',
  tags: ['manufacturing', 'electric-vehicle'],
  projectTypes: [
    {
      key: 'order',
      title: t('Motor order', '驱动电机订单'),
      binding: { kind: 'entity', providerKey: 'ev_motor_project' },
    },
  ],
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: templateKey('coordinator'),
    workspace: {
      mode: 'dedicated',
      name: t('EV motor lifecycle', '驱动电机制造演示'),
      sharing: 'organization',
    },
    assistantSuite: {
      version: '1',
      coordinatorAgentKey: agentKey('coordinator'),
      roles: suiteRoles.map((r) => ({ ...r, title: t(r.key, r.title) })),
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    entry: { type: 'assistant-chat' },
  },
} satisfies PluginMarketplaceContribution
