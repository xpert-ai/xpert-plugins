import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum, type TPromptWorkflow } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  PRESENTATION_AGENT_KEY,
  PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  PRESENTATION_COLLABORATION_CAPABILITY,
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_PLUGIN_NAME,
  PRESENTATION_PROVIDER_KEY,
  PRESENTATION_TEMPLATE_PROVIDER_KEY,
  PRESENTATION_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const templateFile = 'xpert-presentation-studio-assistant.yaml'
function readDsl() {
  const candidates = [
    join(moduleDir, '..', templateFile), join(moduleDir, templateFile),
    join(process.cwd(), 'apps/presentation-studio/src', templateFile),
    join(process.cwd(), 'xpertai/apps/presentation-studio/src', templateFile),
    join(process.cwd(), 'dist/apps/presentation-studio', templateFile)
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Presentation Studio DSL template not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

const capabilities = [PRESENTATION_FEATURE, PRESENTATION_GENERATION_CAPABILITY, PRESENTATION_WORKBENCH_CAPABILITY, PRESENTATION_COLLABORATION_CAPABILITY, PRESENTATION_EXPORT_CAPABILITY]

// Matches the host's PromptWorkflowScenario contract, not yet declared in contracts 3.18.0.
type PresentationPromptWorkflow = TPromptWorkflow & {
  scenarios: { id: string; label: string; args: string }[]
}

export const presentationStudioPromptWorkflows = [
  {
    name: 'presentation-create',
    label: '生成演示稿',
    description: '基于主题或结构化材料创建可编辑演示稿。',
    category: 'presentation',
    argsHint: '请输入主题或材料、目标受众、页数和演示目标。',
    template: [
      '基于以下输入创建一份可编辑演示稿。未指定页数时默认 10 页；先规划结构，再选择合适主题和版式，完成真实内容并保存可审阅版本。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    scenarios: [
      {
        id: 'work-report',
        label: '工作汇报 PPT',
        args: '制作一份 10 页的工作汇报 PPT，面向部门管理层。包含工作目标、完成情况、重点成果、关键数据、存在问题和下一步计划。采用简洁商务风格，以图表和结论突出重点。缺失的数据用“待补充”标注，不编造。'
      },
      {
        id: 'ai-trends',
        label: 'AI 趋势 PPT',
        args: '制作一份 10 页的 AI 趋势分析 PPT，面向企业管理者。介绍大模型、多模态、智能体和企业应用的发展，结合公开案例分析商业价值、落地条件与风险，最后给出行动建议。引用资料注明来源和日期，区分已落地能力与趋势预测；无法核实的信息标注“待核实”。采用简洁科技风格。'
      },
      {
        id: 'annual-summary',
        label: '年终总结 PPT',
        args: '制作一份 10 页的个人或团队年终总结 PPT，面向管理层。包含年度目标、重点项目、核心成果、问题复盘和明年规划。以关键指标、项目时间线和行动计划突出贡献与成长。采用简洁商务风格，缺失的信息用“待补充”标注，不编造业绩。'
      },
      {
        id: 'product-introduction',
        label: '产品介绍 PPT',
        args: '制作一份 10 页的产品介绍 PPT，面向潜在客户。包含客户痛点、产品定位、核心功能、典型使用场景、操作流程、产品优势和下一步行动。采用简洁专业的视觉风格，重点呈现客户价值。产品信息以提供的材料为准，缺失的信息用“待补充”标注，不编造客户案例或效果数据。'
      },
      {
        id: 'project-retrospective',
        label: '项目复盘 PPT',
        args: '制作一份 10 页的项目复盘 PPT，面向项目成员和管理层。包含项目目标、交付成果、关键里程碑、计划与实际偏差、原因分析、经验教训和改进计划。区分事实与推测，用时间线和对比图呈现关键结论。行动项列明负责人和期限，缺失的信息用“待补充”标注。'
      }
    ],
    tags: ['presentation', 'workflow'],
    visibility: 'team'
  },
  {
    name: 'presentation-refine',
    label: '优化演示稿',
    description: '检查并优化现有演示稿，保存新的可审阅版本。',
    category: 'presentation',
    argsHint: '请说明要优化哪份演示稿，以及文案、排版或内容上的修改要求。',
    template: [
      '检查并优化当前或指定演示稿。先读取最新状态，重点检查文案预算、版式契约、媒体引用和页面完整性；只修改需要改进的内容，完成后保存新版本。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    scenarios: [
      {
        id: 'concise-copy',
        label: '精简文案',
        args: '精简当前演示稿的文案，删除重复表述，将长段落改为清晰的短句和要点，每页突出一个核心结论。保留原始事实、关键数据和引用，不改变原意；发现缺失信息时标注“待补充”。'
      },
      {
        id: 'improve-layout',
        label: '优化排版',
        args: '优化当前演示稿的排版，统一标题层级、字体、间距和对齐，检查文字溢出、图表可读性以及图片比例。沿用现有主题，保留原始内容和数据，仅调整需要改进的页面。'
      },
      {
        id: 'check-completeness',
        label: '检查完整性',
        args: '检查当前演示稿的叙事顺序、页面完整性、数字与单位一致性、图表标题、媒体引用和来源标注。修复可以确定的问题，对缺失材料或无法核实的数据明确标注，列出仍需用户补充的内容。'
      }
    ],
    tags: ['presentation', 'workflow'],
    visibility: 'team'
  },
  {
    name: 'presentation-export',
    label: '导出演示稿',
    description: '将演示稿导出为 HTML、PDF 或 PPTX。',
    category: 'presentation',
    argsHint: '请指定演示稿及导出格式（HTML、PDF 或 PPTX）；不指定演示稿时使用当前演示稿。',
    template: [
      '将当前或指定演示稿导出为要求的格式；未指定格式时导出 HTML、PDF 和 PPTX。等待每项导出完成并返回实际可用的结果，不要声称失败或未完成的导出已经成功。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    scenarios: [
      {
        id: 'export-pptx',
        label: '导出 PPTX',
        args: '将当前演示稿的最新版本仅导出为 PPTX，供后续编辑和演示。等待导出完成后返回实际可下载的文件；失败时说明原因。'
      },
      {
        id: 'export-pdf',
        label: '导出 PDF',
        args: '将当前演示稿的最新版本仅导出为 PDF，供审阅和分发。等待导出完成后返回实际可下载的文件；失败时说明原因。'
      },
      {
        id: 'export-html',
        label: '导出 HTML',
        args: '将当前演示稿的最新版本仅导出为 HTML，供浏览器查看。等待导出完成后返回实际可用的导出结果；失败时说明原因。'
      }
    ],
    tags: ['presentation', 'export'],
    visibility: 'team'
  },
  {
    name: 'presentation-share',
    label: '分享演示稿',
    description: '为演示稿生成 HTML 分享链接。',
    category: 'presentation',
    argsHint: '请指定要分享的演示稿；不填写时使用当前演示稿。',
    template: [
      '为当前或指定演示稿生成 HTML 分享链接。等待必要的导出完成，只使用工具返回的链接；最终回复只返回工具产生的 shareUrl，不添加说明或自行构造链接。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    scenarios: [
      {
        id: 'share-link',
        label: '生成分享链接',
        args: '为当前演示稿的最新版本生成可供浏览器访问的 HTML 分享链接。等待必要的导出完成，成功后只返回工具实际生成的分享链接。'
      }
    ],
    tags: ['presentation', 'share'],
    visibility: 'team'
  }
] satisfies PresentationPromptWorkflow[]

export const presentationStudioTemplates: XpertTemplateContribution[] = [{
  key: PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  name: 'Presentation Studio Assistant',
  title: '演示文稿生成助手',
  description: '基于 DashiAI 14 套主题和 1188 个版式的人机协作演示文稿助手。',
  category: 'Productivity',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert', 'xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'], capabilities, requiredPlugins: [PRESENTATION_PLUGIN_NAME],
      defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'presentation-studio', managedBy: 'data-xpert', viewProvider: PRESENTATION_PROVIDER_KEY }
    },
    xpert: { types: ['assistant-template'], capabilities, requiredPlugins: [PRESENTATION_PLUGIN_NAME] }
  },
  dependencies: { plugins: [PRESENTATION_PLUGIN_NAME], skills: [{ componentKey: 'presentation-studio-agent-skill', targetAgentKey: PRESENTATION_AGENT_KEY }] },
  dslContent: readDsl(),
  order: 73,
  default: false,
  startPrompts: [
    '请基于这份结构化材料生成一份 10 页项目汇报演示稿。',
    '为这次产品发布选择合适主题和版式，并生成可编辑 PPTX。',
    '请检查当前演示稿的文案预算、版式和媒体引用后保存版本。',
    '将当前演示稿导出为 HTML、PDF 和 PPTX。'
  ],
  promptWorkflows: presentationStudioPromptWorkflows,
  releaseNotes: 'Created the Presentation Studio Agentic App assistant.',
  xpertName: '演示文稿生成助手',
  providerKey: PRESENTATION_TEMPLATE_PROVIDER_KEY
} as XpertTemplateContribution]
