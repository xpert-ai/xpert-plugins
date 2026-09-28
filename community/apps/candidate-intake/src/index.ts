import { z } from 'zod'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  CANDIDATE_INTAKE_FEATURE,
  CANDIDATE_INTAKE_ICON,
  CANDIDATE_INTAKE_LEVEL,
  CANDIDATE_INTAKE_MIDDLEWARE,
  CANDIDATE_INTAKE_NAMESPACE,
  CANDIDATE_INTAKE_PLUGIN_NAME,
  CANDIDATE_INTAKE_VERSION,
  CANDIDATE_INTAKE_VIEW,
  CANDIDATE_INTAKE_VIEW_PROVIDER
} from './lib/constants.js'
import { CandidateIntakePlugin } from './lib/candidate-intake.plugin.js'
import {
  CANDIDATE_INTAKE_TEMPLATE_KEY,
  CANDIDATE_INTAKE_TEMPLATE_PROVIDER,
  candidateIntakeTemplates
} from './lib/candidate-intake.templates.js'

const ConfigSchema = z.object({})

const appContribution = {
  type: 'app',
  name: 'candidate-intake',
  displayName: { en_US: 'Candidate Intake', zh_Hans: '候选人招聘登记' },
  description: {
    en_US: 'Collect candidate information, prefill from PDF resumes, run Agent screening, and let HR confirm the decision.',
    zh_Hans: '候选人填写信息并通过 PDF 简历预填，Agent 执行初筛，HR 完成人工确认。'
  },
  icon: { type: 'svg', value: CANDIDATE_INTAKE_ICON, color: '#1d4ed8' },
  color: '#1d4ed8',
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: CANDIDATE_INTAKE_TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: { en_US: 'Candidate Intake Workspace', zh_Hans: '候选人招聘登记工作空间' },
      description: { en_US: 'Recruiting operations managed by Candidate Intake.', zh_Hans: '用于候选人登记和招聘初筛。' },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'From candidate submission to evidence-based HR review', zh_Hans: '从候选人填报到证据化人工确认' },
      longDescription: {
        en_US: 'Issue secure candidate links, collect editable resume data, screen against hidden job criteria, and preserve the HR decision.',
        zh_Hans: '生成安全候选人链接，收集并核对简历信息，按隐藏岗位条件初筛，并保留 HR 人工决定。'
      },
      developer: 'XpertAI Community',
      features: [
        { key: 'candidate-self-service', title: { en_US: 'Candidate self-service', zh_Hans: '候选人自主填报' }, description: { en_US: 'Secure links, autosaved drafts, and editable PDF prefill.', zh_Hans: '安全链接、草稿保存和可编辑 PDF 预填。' } },
        { key: 'evidence-screening', title: { en_US: 'Evidence screening', zh_Hans: '证据化 Agent 初筛' }, description: { en_US: 'Evaluate each criterion without inventing missing facts.', zh_Hans: '逐条评估岗位条件，不补造缺失信息。' } },
        { key: 'human-confirmation', title: { en_US: 'Human confirmation', zh_Hans: 'HR 人工确认' }, description: { en_US: 'HR reviews evidence and records the final decision.', zh_Hans: 'HR 审核证据并记录最终决定。' } }
      ],
      useCases: [{ en_US: 'Candidate intake', zh_Hans: '候选人信息登记' }, { en_US: 'Resume screening', zh_Hans: '简历初筛' }],
      dataScope: { en_US: 'Candidate data is restricted to the current organization.', zh_Hans: '候选人数据仅限当前组织内使用。' },
      initializationSummary: { en_US: 'Create a dedicated workspace and publish the recruiting Assistant.', zh_Hans: '创建专用工作空间并发布招聘助手。' },
      initializationSteps: [{ en_US: 'Create the recruiting workspace', zh_Hans: '创建招聘工作空间' }, { en_US: 'Install and publish the Assistant', zh_Hans: '安装并发布招聘助手' }]
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: CANDIDATE_INTAKE_PLUGIN_NAME,
    version: CANDIDATE_INTAKE_VERSION,
    level: CANDIDATE_INTAKE_LEVEL,
    artifactNamespace: CANDIDATE_INTAKE_NAMESPACE,
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [CANDIDATE_INTAKE_FEATURE, 'candidate-resume-prefill', 'candidate-screening-review'],
        marketplace: { contents: [appContribution] },
        runtime: {
          middlewareProviders: [CANDIDATE_INTAKE_MIDDLEWARE],
          viewProviders: [CANDIDATE_INTAKE_VIEW_PROVIDER],
          templateProviders: [CANDIDATE_INTAKE_TEMPLATE_PROVIDER]
        }
      }
    },
    icon: { type: 'svg', value: CANDIDATE_INTAKE_ICON, color: '#1d4ed8' },
    displayName: 'Candidate Intake',
    description: 'Candidate self-service intake, PDF resume prefill, Agent screening, and HR confirmation.',
    keywords: ['recruiting', 'candidate', 'resume', 'screening', 'workbench'],
    author: 'XpertAI Community'
  },
  config: { schema: ConfigSchema },
  templates: candidateIntakeTemplates,
  register(ctx) {
    ctx.logger.log('register candidate intake plugin')
    return { module: CandidateIntakePlugin, global: true }
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/candidate-intake.plugin.js'
export * from './lib/candidate-intake.service.js'
export * from './lib/candidate-intake.middleware.js'
export * from './lib/candidate-intake-view.provider.js'
export { CANDIDATE_INTAKE_VIEW }
