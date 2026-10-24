import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { APP_ICON } from './lib/artifact-namespace.js'
import { ROLES } from './lib/roles.js'
import { MATERIAL_PROJECT_PROVIDER } from './lib/server/project-type.js'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const materialIdentityApp = {
  type: 'app',
  name: 'material-identity-governance',
  displayName: text('Material Identity Governance', '物料主数据智能治理'),
  description: text(
    'Govern duplicate codes, conflicting identities and duplicate engineering requests.',
    '治理一物多码、一码多物与研发重复建码。',
  ),
  icon: APP_ICON,
  color: '#2457A7',
  tags: ['manufacturing', 'master-data', 'multi-agent'],
  projectTypes: [{ key: 'case', title: text('Material Governance Case', '物料治理案例'),
    binding: { kind: 'entity', providerKey: MATERIAL_PROJECT_PROVIDER } }],
  appConfig: {
    assistantSuite: {
      version: '1',
      coordinatorAgentKey: 'Agent_coordinator',
      roles: ROLES.filter((r) => r.key !== 'coordinator').map((r) => ({
        key: r.key,
        templateKey: r.templateKey,
        primaryAgentKey: r.agentKey,
        title: { en_US: r.key, zh_Hans: r.title },
      })),
    },
    scope: 'organization',
    assistantTemplateKey: 'material-identity-coordinator',
    workspace: {
      mode: 'dedicated',
      name: text('Material Identity Governance', '物料主数据智能治理'),
      description: text(
        'Shared workspace for seven roles and their coordinator.',
        '七位业务角色及治理协调者的组织共享工作空间。',
      ),
      sharing: 'organization',
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: text(
        'One canonical identity. Evidence for every decision.',
        '统一物料身份，让每次治理有据可查。',
      ),
      longDescription: text(
        'Seven specialist Assistants and a coordinator reconcile source records, drawing attributes and business impact. Review evidence and approve a specific proposal revision, then follow execution and historical rounds in Project Tasks. External enterprise systems use Mock adapters.',
        '七位业务助理与协调者汇集来源记录、图纸属性及业务影响，人工核对证据并审批指定修订的治理方案，在项目任务中追踪执行与历史轮次。外部业务系统使用 Mock 适配器。',
      ),
      developer: 'XpertAI',
      screenshots: ['./assets/brand/material-identity-governance-cover-zh-v1.png'],
      features: [
        {
          key: 'identity',
          title: text('Canonical material identity', '全局物料身份'),
          description: text(
            'Keep legitimate plant aliases while separating incompatible specifications.',
            '保留合法工厂别名，按关键属性区分不同规格。',
          ),
        },
        {
          key: 'roles',
          title: text('Independent role Assistants', '独立角色协作'),
          description: text(
            'Seven role Assistants and one coordinator with explicit capabilities.',
            '七位业务助理与一位协调者分工完成采集、图纸核验、标准化、审计、影响评估和发布。',
          ),
        },
        {
          key: 'audit',
          title: text('Evidence and governed execution', '证据与受控执行'),
          description: text(
            'Inspect execution records and historical rounds in Project Tasks. Human approval is bound to a proposal revision.',
            '在项目任务中查看执行记录与历史轮次，人工审批绑定方案修订。',
          ),
        },
      ],
      useCases: [
        text('Cross-plant bearing aliases', '轴承跨厂编码归一'),
        text('Battery bracket code collision', '电池托架同码异物拆分'),
        text(
          'Engineering drawing duplicate prevention',
          '研发图纸识别与重复建码拦截',
        ),
      ],
      dataScope: text(
        'Data is limited to the current organization and authorized case Projects. External MDM and ERP publishing is simulated with Mock adapters.',
        '数据限定在当前组织及用户有权访问的案例项目内；向外部 MDM、ERP 的发布使用 Mock 模拟。',
      ),
      initializationSummary: text(
        'Create an organization workspace and install the governed Assistant suite.',
        '创建组织工作空间，安装并发布治理助理套件。',
      ),
      initializationSteps: [
        text('Verify the organization primary model.', '检查组织主模型。'),
        text('Create a shared workspace and install seven role Assistants.', '创建共享工作空间并安装七位业务助理。'),
        text(
          'Connect the role Assistants and publish the coordinator.',
          '关联业务助理并发布治理协调者。',
        ),
      ],
    },
    entry: { type: 'assistant-chat' },
  },
} satisfies PluginMarketplaceContribution
