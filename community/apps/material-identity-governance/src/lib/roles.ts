import type { RoleKey } from './contracts.js'
export const ROLES = [
  {
    key: 'coordinator',
    title: '治理协调者',
    templateKey: 'material-identity-coordinator',
    agentKey: 'Agent_coordinator',
    middleware: 'material_identity_coordinator',
    feature: 'material_identity_coordinator',
    nodeKeys: [],
    avatar: {
      emoji: {
        id: 'compass',
        unified: '1f9ed',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'intake',
    title: '数据采集专员',
    templateKey: 'material-identity-intake',
    agentKey: 'Agent_intake',
    middleware: 'material_identity_intake',
    feature: 'material_identity_intake',
    nodeKeys: ['collect-evidence'],
    avatar: {
      emoji: {
        id: 'inbox_tray',
        unified: '1f4e5',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'engineering',
    title: '研发图纸工程师',
    templateKey: 'material-identity-engineering',
    agentKey: 'Agent_engineering',
    middleware: 'material_identity_engineering',
    feature: 'material_identity_engineering',
    nodeKeys: ['extract-drawing'],
    avatar: {
      emoji: {
        id: 'triangular_ruler',
        unified: '1f4d0',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'standardization',
    title: '物料标准化工程师',
    templateKey: 'material-identity-standardization',
    agentKey: 'Agent_standardization',
    middleware: 'material_identity_standardization',
    feature: 'material_identity_standardization',
    nodeKeys: ['normalize-material', 'match-identity'],
    avatar: {
      emoji: {
        id: 'toolbox',
        unified: '1f9f0',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'quality',
    title: '质量冲突审计员',
    templateKey: 'material-identity-quality',
    agentKey: 'Agent_quality',
    middleware: 'material_identity_quality',
    feature: 'material_identity_quality',
    nodeKeys: ['audit-conflicts'],
    avatar: {
      emoji: {
        id: 'shield',
        unified: '1f6e1-fe0f',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'impact',
    title: '供应链影响分析师',
    templateKey: 'material-identity-impact',
    agentKey: 'Agent_impact',
    middleware: 'material_identity_impact',
    feature: 'material_identity_impact',
    nodeKeys: ['assess-impact'],
    avatar: {
      emoji: {
        id: 'truck',
        unified: '1f69a',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'governance',
    title: '主数据治理专员',
    templateKey: 'material-identity-governance',
    agentKey: 'Agent_governance',
    middleware: 'material_identity_governance',
    feature: 'material_identity_governance',
    nodeKeys: ['propose-governance'],
    avatar: {
      emoji: {
        id: 'clipboard',
        unified: '1f4cb',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
  {
    key: 'publisher',
    title: '系统发布与监控专员',
    templateKey: 'material-identity-publisher',
    agentKey: 'Agent_publisher',
    middleware: 'material_identity_publisher',
    feature: 'material_identity_publisher',
    nodeKeys: ['publish-records'],
    avatar: {
      emoji: {
        id: 'outbox_tray',
        unified: '1f4e4',
      },
      background: 'rgb(239, 246, 255)',
    },
  },
] as const
export const roleDefinition = (key: RoleKey) =>
  ROLES.find((r) => r.key === key)!
export const WORKBENCH_FEATURE = 'material_identity_workbench'
export const toolName = (node: string) =>
  `material_identity_${node.replaceAll('-', '_')}`
