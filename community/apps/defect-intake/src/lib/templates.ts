import { XpertTypeEnum, WorkflowNodeTypeEnum, XpertWorkbenchInitialLayoutEnum, type TXpertTeamDraft, type TXpertTeamNode, type IWFNMiddleware } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { artifact, feature, middlewareName, packageMeta } from './constants'

const definition = {
  key: artifact('assistant'), title: '智能工单补全助手',
  description: 'AI 整理问题反馈，追问缺失信息，生成可核对的缺陷工单。',
  startPrompts: ['请查找我已保存的反馈，帮我整理缺陷报告并提出必要的追问。', '请查看我这份报告的分析状态和待补充事项。']
}
const primaryKey = 'Agent_Intake'
type PortableWorkflow = Omit<TXpertTeamNode<'workflow'>, 'entity'> & { entity: Omit<IWFNMiddleware, 'id'> }
const middlewareNodes: PortableWorkflow[] = [
  { type: 'workflow', key: 'Middleware_Context', position: { x: 80, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Context', title: 'Context compression', provider: 'ContextCompressionMiddleware', required: true, options: { threshold: 0.7, preserveFraction: 0.3, enableTwoPhaseCompression: true, protectedUserTurns: 2 } } satisfies Omit<IWFNMiddleware, 'id'> },
  { type: 'workflow', key: 'Middleware_Todo', position: { x: 380, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Todo', title: 'Task progress', provider: 'todoListMiddleware', required: true, options: {} } satisfies Omit<IWFNMiddleware, 'id'> },
  { type: 'workflow', key: 'Middleware_Intake', position: { x: 680, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Intake', title: '智能工单补全工作台', provider: middlewareName, required: true, options: {} } satisfies Omit<IWFNMiddleware, 'id'> }
]

/** Typed against the selected public contracts, rather than an outdated YAML example. */
export const assistantDraft = {
  team: {
    name: definition.key, type: XpertTypeEnum.Agent, title: definition.title, description: definition.description,
    version: '3', agent: { key: primaryKey },
    features: { opener: { enabled: true, message: '', questions: definition.startPrompts }, suggestion: { enabled: false, prompt: '' }, textToSpeech: { enabled: false }, speechToText: { enabled: false } },
    options: { templateKey: definition.key, dataXpert: { requiredPlugins: [packageMeta.name] }, workbench: { initialLayout: XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized } },
    agentConfig: { recursionLimit: 20 }, knowledgebases: [], toolsets: [], tags: []
  },
  nodes: [{ type: 'agent', key: primaryKey, position: { x: 380, y: 60 }, entity: {
    key: primaryKey, name: definition.key, title: definition.title,
    prompt: '你帮助测试和技术支持整理本人保存的缺陷反馈。使用工具读取真实记录，按用户意图发起后台 AI 整理或失败重试，并如实说明任务状态。排队中或分析中不表示已经生成报告。已有建议和追问可在智能工单补全工作台查看、回答与编辑；用户补充后先保存，再重新整理。只根据已提供的事实回答，未知信息保持未知，不推断根因、伪造日志或声称已查询外部业务系统。报告只能由用户在工作台确认，确认不表示研发受理或缺陷已修复。',
    options: { middlewares: { order: middlewareNodes.map(node => node.key) }, fileUnderstanding: { enabled: false } },
    collaboratorNames: [], toolsetIds: [], knowledgebaseIds: []
  } }, ...middlewareNodes],
  connections: middlewareNodes.map(node => ({ type: 'workflow' as const, key: `${primaryKey}/${node.key}`, from: primaryKey, to: node.key, required: true }))
} satisfies Omit<TXpertTeamDraft, 'nodes'> & { nodes: (TXpertTeamNode<'agent'> | PortableWorkflow)[] }

export const templates: XpertTemplateContribution[] = [{
  key: definition.key, name: definition.key, title: definition.title, description: definition.description,
  type: XpertTypeEnum.Agent, category: '研发协作', targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [feature], requiredPlugins: [packageMeta.name] } },
  startPrompts: definition.startPrompts, dslContent: JSON.stringify(assistantDraft, null, 2),
  releaseNotes: '名称统一为智能工单补全助手，明确 AI 整理、追问补充与人工核对的用途。', order: 60
}]
