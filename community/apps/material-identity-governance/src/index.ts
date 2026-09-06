import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { z } from 'zod'
import {
  APP_ICON,
  PLUGIN_NAME,
  ARTIFACT_NAMESPACE,
  PLUGIN_VERSION,
  artifactKey,
} from './lib/artifact-namespace.js'
import { templates } from './lib/assistant-templates.js'
import { ROLES, WORKBENCH_FEATURE } from './lib/roles.js'
import { ConfigSchema, RUNTIME_SCOPE } from './lib/server/config.js'
import { MaterialGovernancePlugin } from './lib/server/plugin.module.js'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const app: PluginMarketplaceContribution = {
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
  appConfig: {
    ...{
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
    modelRequirements: { primary: true },
    presentation: {
      tagline: text(
        'One canonical identity. Evidence for every decision.',
        '统一物料身份，让每次治理有据可查。',
      ),
      longDescription: text(
        'A multi-department governance pipeline with seven independent role Assistants, a human approval gate and inspectable execution plans. External enterprise systems are programmatic mocks.',
        '通过七位独立业务角色 Assistants 与协调者协同完成证据采集、图纸标注提取、规范化、身份核验、质量审计、影响评估、人工审批及受控发布。外部业务系统使用程序 Mock。',
      ),
      developer: 'XpertAI',
      screenshots: ['./assets/dashboard.jpg', './assets/pipeline.jpg'],
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
            '七位角色助理与一位协调者，各有对应中间件、工具及工作视图。',
          ),
        },
        {
          key: 'audit',
          title: text('Evidence and execution plans', '证据与执行规划'),
          description: text(
            'Review real execution attempts and revision-bound approval.',
            '查看真实执行尝试，审批绑定方案修订。',
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
        'Current organization and authorized case Projects.',
        '当前组织及用户有权访问的案例项目。',
      ),
      initializationSummary: text(
        'Create an organization workspace and install the governed Assistant suite.',
        '创建组织工作空间，安装并发布治理助理套件。',
      ),
      initializationSteps: [
        text('Verify the organization primary model.', '检查组织主模型。'),
        text('Install independent role Assistants.', '安装七位独立角色助理。'),
        text(
          'Connect required External Xperts and publish the coordinator.',
          '建立必需的 External Xpert 直连并发布协调者。',
        ),
      ],
    },
    entry: { type: 'assistant-chat' },
  },
}
const capabilities = [...ROLES.map((r) => r.feature), WORKBENCH_FEATURE]
const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    level: 'tenant',
    artifactNamespace: ARTIFACT_NAMESPACE,
    category: 'middleware',
    displayName: '物料主数据智能治理',
    description:
      'Evidence-governed material identity management for automotive components.',
    author: 'XpertAI',
    icon: APP_ICON,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: Object.fromEntries(
      ['data-xpert', 'xpert'].map((key) => [
        key,
        {
          types: ['business-app', 'assistant-template', 'workbench-view'],
          capabilities,
          marketplace: { contents: [app] },
          runtime: {
            middlewareProviders: ROLES.map((r) => r.middleware),
            viewProviders: [artifactKey('views')],
            templateProviders: [artifactKey('templates')],
          },
        },
      ]),
    ),
  },
  config: { schema: ConfigSchema, defaults: { mode: 'mock', debug: false } },
  templates,
  register(ctx) {
    return {
      module: MaterialGovernancePlugin,
      global: true,
      providers: [
        {
          provide: RUNTIME_SCOPE,
          useValue: { scopeKey: ctx.scopeKey ?? 'global' },
        },
      ],
      exports: [RUNTIME_SCOPE],
    }
  },
}
export default plugin
export { templates }
