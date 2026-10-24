import type { I18nObject, PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { FACTORY_ICON, FACTORY_MANAGER_TEMPLATE_KEY } from './lib/constants.js'
import { FACTORY_CASE_PROJECT_PROVIDER } from './lib/factory-project-type.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

export const factoryOperationsApp = {
  type: 'app',
  name: 'factory-operations',
  displayName: text('Factory Intelligent Operations Center', '工厂智能运营与异常恢复中心'),
  description: text(
    'Investigate anomalies, review recovery plans, and track production recovery with evidence.',
    '协同研判生产异常、审批恢复方案，并追踪恢复结果与证据。'
  ),
  icon: FACTORY_ICON,
  color: '#0F766E',
  tags: ['business-operations', 'factory', 'multi-agent'],
  projectTypes: [{ key: 'case', title: text('Factory Case', '工厂 Case'),
    binding: { kind: 'entity', providerKey: FACTORY_CASE_PROJECT_PROVIDER } }],
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: FACTORY_MANAGER_TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: text('Factory Intelligent Operations', '工厂智能运营与异常恢复'),
      description: text(
        'Organization-shared workspace for factory recovery monitoring and the independent Assistant suite.',
        '用于工厂异常恢复监控与独立 Assistant 套件的组织共享工作空间。'
      ),
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: text(
        'See the risk. Coordinate the recovery. Prove the result.',
        '看清风险，协同恢复，验证结果。'
      ),
      longDescription: text(
        'Bring equipment, quality, production and resource evidence into one recovery process. Project Pipelines track execution and history; people approve revision-bound plans. The default environment uses simulated equipment and execution confirmations.',
        '汇集设备、质量、生产与资源证据，通过项目任务流水线追踪执行和历史轮次，由人工审批当前修订的恢复方案。默认使用设备与执行确认的仿真环境。'
      ),
      developer: 'XpertAI',
      screenshots: ['./assets/brand/factory-operations-cover-zh-v1.png'],
      features: [
        {
          key: 'independent-role-assistants',
          title: text('Specialist collaboration', '专业角色协作'),
          description: text(
            'Eight specialist Assistants coordinate anomaly triage, diagnostics, impact analysis, planning and verification.',
            '八位专业助理分工完成异常研判、设备诊断、影响分析、方案规划与恢复验证。'
          )
        },
        {
          key: 'governed-recovery-pipeline',
          title: text('Governed recovery pipeline', '受控异常恢复流水线'),
          description: text(
            'Follow execution records and historical rounds in Project Tasks. Approval is bound to the current plan revision.',
            '在项目任务中查看执行记录与历史轮次；人工审批绑定当前方案修订。'
          )
        },
        {
          key: 'management-monitoring',
          title: text('Management monitoring', '管理监控'),
          description: text(
            'Inspect recovery trends, blocked work and evidence for each Factory Case.',
            '查看恢复趋势、受阻任务，并下钻到具体 Factory Case 的业务证据。'
          )
        }
      ],
      useCases: [
        text('Severe equipment anomaly recovery', '严重设备异常恢复'),
        text('Cross-role evidence reconciliation', '跨角色证据会诊'),
        text('Recovery throughput and blocker monitoring', '恢复吞吐与阻塞监控')
      ],
      dataScope: text(
        'Application data stays within the current organization; case work follows Project access controls. The default simulation does not operate production equipment.',
        '应用数据限定在当前组织内，案例操作遵循项目访问权限；默认仿真不操作生产设备。'
      ),
      initializationSummary: text(
        'Create a shared workspace and publish the read-only management Assistant. An administrator deploys the operational role suite separately before starting case pipelines.',
        '创建组织共享工作空间并发布只读管理助理。开展案例流水线前，需由管理员另行部署运营角色套件。'
      ),
      initializationSteps: [
        text('Verify an enabled primary model.', '检查可用的主模型。'),
        text('Create the dedicated organization workspace.', '创建专用组织工作空间。'),
        text('Install and publish the management Assistant.', '安装并发布管理 Assistant。')
      ]
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution
