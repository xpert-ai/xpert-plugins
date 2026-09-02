import { stringify } from 'yaml'
import { FACTORY_PLUGIN_NAME } from './constants.js'
import type { FactoryRoleAssistantDefinition } from './factory-assistant-definitions.js'

const taskParameters = [
  {
    type: 'string',
    name: 'caseId',
    description: 'Exact Factory Case UUID from factory_case_get_summary.',
    optional: false
  },
  {
    type: 'number',
    name: 'baseRevision',
    description: 'Exact persisted Factory Case revision used for this attempt.',
    optional: false
  },
  {
    type: 'string',
    name: 'operationId',
    description: 'Stable idempotency key for one identical retry.',
    optional: false
  },
  {
    type: 'string',
    name: 'caseContext',
    description: 'Bounded JSON projection of the persisted Factory Case and authorized evidence.',
    optional: false
  }
] as const

export function buildRoleAssistantDsl(definition: FactoryRoleAssistantDefinition) {
  const nodes = [
    {
      type: 'agent',
      key: definition.agentKey,
      position: { x: 420, y: 40 },
      entity: {
        key: definition.agentKey,
        name: definition.agentName,
        title: definition.title,
        description: definition.description,
        avatar: definition.avatar,
        prompt: definition.prompt,
        promptTemplates: null,
        parameters: taskParameters,
        outputVariables: null,
        options: {
          disableMessageHistory: true,
          parallelToolCalls: false,
          retry: { enabled: true, stopAfterAttempt: 2 },
          middlewares: { order: definition.middleware.map(({ key }) => key) }
        },
        copilotModel: null,
        leaderKey: null,
        collaboratorNames: [],
        toolsetIds: [],
        knowledgebaseIds: []
      },
      hash: `${definition.agentName}-v2`
    },
    ...definition.middleware.map((middleware, index) => ({
      type: 'workflow',
      key: middleware.key,
      position: { x: 300 + index * 240, y: 360 },
      entity: {
        type: 'middleware',
        key: middleware.key,
        title: middleware.title,
        provider: middleware.provider,
        required: true
      },
      hash: `${middleware.key.toLowerCase()}-v2`
    }))
  ]
  const connections = definition.middleware.map((middleware) => ({
    type: 'workflow',
    key: `${definition.agentKey}/${middleware.key}`,
    from: definition.agentKey,
    to: middleware.key,
    required: true
  }))

  return stringify({
    team: {
      name: definition.key,
      type: 'agent',
      title: definition.title,
      description: definition.description,
      avatar: definition.avatar,
      options: {
        templateKey: definition.key,
        workspaceScope: { mode: 'project-required' },
        dataXpert: {
          managedBy: 'data-xpert',
          templateKey: definition.key,
          assistantKind: 'business-assistant',
          businessDomain: 'factory-operations',
          roleKey: definition.roleKey,
          laneKey: definition.laneKey,
          requiredPlugin: FACTORY_PLUGIN_NAME,
          requiredPlugins: [FACTORY_PLUGIN_NAME],
          requiredCapabilities: definition.middleware.map(({ feature }) => feature)
        },
        agent: {
          [definition.agentKey]: { position: { x: 420, y: 40 } }
        }
      },
      agentConfig: {
        recursionLimit: 40,
        maxConcurrency: 1,
        timeout: 120000,
        parameters: taskParameters,
        stateVariables: [],
        mute: []
      },
      memory: { enabled: false },
      summarize: { enabled: true, maxMessages: 20, retainMessages: 8 },
      features: {
        opener: {
          enabled: true,
          message: '',
          questions: [...definition.startPrompts]
        },
        suggestion: {
          enabled: true,
          prompt: '仅建议与当前角色边界和 Factory Case 前置条件相关的问题。'
        },
        attachment: { enabled: false },
        memoryReply: { enabled: false },
        sandbox: { enabled: false },
        title: {
          enabled: true,
          instruction: `生成包含 Factory Case 与${definition.title}任务的简短标题。`
        }
      },
      version: '2',
      agent: { key: definition.agentKey },
      copilotModel: {
        referencedId: null,
        modelType: 'llm',
        model: 'qwen3.6-plus',
        options: {
          context_size: 256000,
          temperature: 0.1,
          maxRetries: 3,
          max_tokens: 4096
        }
      },
      knowledgebases: [],
      toolsets: [],
      tags: []
    },
    nodes,
    connections
  }, { lineWidth: 100 })
}
