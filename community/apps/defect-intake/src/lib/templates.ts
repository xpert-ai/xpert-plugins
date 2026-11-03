import { XpertTypeEnum, WorkflowNodeTypeEnum, XpertWorkbenchInitialLayoutEnum, type TXpertTeamDraft, type TXpertTeamNode, type IWFNMiddleware } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { artifact, feature, middlewareName, packageMeta } from './constants'

const definition = {
  key: artifact('assistant'), title: '缺陷受理与澄清助手',
  description: '在工作台保留原始反馈、补充事实、编辑并核对缺陷报告。',
  startPrompts: ['如何录入和保存一份缺陷报告？', '确认报告之前需要核对什么？']
}
const primaryKey = 'Agent_Intake'
type PortableWorkflow = Omit<TXpertTeamNode<'workflow'>, 'entity'> & { entity: Omit<IWFNMiddleware, 'id'> }
const middlewareNodes: PortableWorkflow[] = [
  { type: 'workflow', key: 'Middleware_Context', position: { x: 80, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Context', title: 'Context compression', provider: 'ContextCompressionMiddleware', required: true, options: { threshold: 0.7, preserveFraction: 0.3, enableTwoPhaseCompression: true, protectedUserTurns: 2 } } satisfies Omit<IWFNMiddleware, 'id'> },
  { type: 'workflow', key: 'Middleware_Todo', position: { x: 380, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Todo', title: 'Task progress', provider: 'todoListMiddleware', required: true, options: {} } satisfies Omit<IWFNMiddleware, 'id'> },
  { type: 'workflow', key: 'Middleware_Intake', position: { x: 680, y: 300 }, entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_Intake', title: '缺陷受理工作台', provider: middlewareName, required: true, options: {} } satisfies Omit<IWFNMiddleware, 'id'> }
]

/** Typed against the selected public contracts, rather than an outdated YAML example. */
export const assistantDraft = {
  team: {
    name: definition.key, type: XpertTypeEnum.Agent, title: definition.title, description: definition.description,
    version: '1', agent: { key: primaryKey },
    features: { opener: { enabled: true, message: '', questions: definition.startPrompts }, suggestion: { enabled: false, prompt: '' }, textToSpeech: { enabled: false }, speechToText: { enabled: false } },
    options: { templateKey: definition.key, dataXpert: { requiredPlugins: [packageMeta.name] }, workbench: { initialLayout: XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized } },
    agentConfig: { recursionLimit: 20 }, knowledgebases: [], toolsets: [], tags: []
  },
  nodes: [{ type: 'agent', key: primaryKey, position: { x: 380, y: 60 }, entity: {
    key: primaryKey, name: definition.key, title: definition.title,
    prompt: '你帮助测试和技术支持整理缺陷报告。第一阶段请指导用户在缺陷受理工作台录入、编辑和保存。当前没有分析或记录写入工具，不能声称已读取、分析、保存或确认任何业务记录。只根据用户明确提供的信息回答，未知事实保持未知，不推断根因或伪造日志。报告确认由用户在工作台完成，确认不代表研发受理或修复。',
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
  releaseNotes: '第一阶段：反馈录入、人工编辑、数据库保存与恢复；尚未接入 AI 分析。', order: 60
}]
