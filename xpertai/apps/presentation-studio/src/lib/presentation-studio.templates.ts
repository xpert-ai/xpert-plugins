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

export const presentationStudioPromptWorkflows = [
  {
    name: 'presentation-create',
    label: '生成演示稿',
    description: '基于主题或结构化材料创建可编辑演示稿。',
    category: 'presentation',
    argsHint: '{"topic_or_material":"...","audience":"...","page_count":10,"goal":"..."}',
    template: [
      '基于以下输入创建一份可编辑演示稿。未指定页数时默认 10 页；先规划结构，再选择合适主题和版式，完成真实内容并保存可审阅版本。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    tags: ['presentation', 'workflow'],
    visibility: 'team'
  },
  {
    name: 'presentation-refine',
    label: '优化演示稿',
    description: '检查并优化现有演示稿，保存新的可审阅版本。',
    category: 'presentation',
    argsHint: '{"deck_id":"...","requirements":"..."}',
    template: [
      '检查并优化当前或指定演示稿。先读取最新状态，重点检查文案预算、版式契约、媒体引用和页面完整性；只修改需要改进的内容，完成后保存新版本。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    tags: ['presentation', 'workflow'],
    visibility: 'team'
  },
  {
    name: 'presentation-export',
    label: '导出演示稿',
    description: '将演示稿导出为 HTML、PDF 或 PPTX。',
    category: 'presentation',
    argsHint: '{"deck_id":"...","formats":["html","pdf","pptx"]}',
    template: [
      '将当前或指定演示稿导出为要求的格式；未指定格式时导出 HTML、PDF 和 PPTX。等待每项导出完成并返回实际可用的结果，不要声称失败或未完成的导出已经成功。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    tags: ['presentation', 'export'],
    visibility: 'team'
  },
  {
    name: 'presentation-share',
    label: '分享演示稿',
    description: '为演示稿生成 HTML 分享链接。',
    category: 'presentation',
    argsHint: '{"deck_id":"..."}',
    template: [
      '为当前或指定演示稿生成 HTML 分享链接。等待必要的导出完成，只使用工具返回的链接；最终回复只返回工具产生的 shareUrl，不添加说明或自行构造链接。',
      '请使用用户输入的语言输出。',
      '',
      '{{args}}'
    ].join('\n'),
    tags: ['presentation', 'share'],
    visibility: 'team'
  }
] satisfies TPromptWorkflow[]

export const presentationStudioTemplates: XpertTemplateContribution[] = [{
  key: PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  name: 'Presentation Studio Assistant',
  title: '演示文稿生成助手',
  description: '基于 DashiAI 12 套主题和 1020 个版式的人机协作演示文稿助手。',
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
