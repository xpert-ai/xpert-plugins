import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { TestCaseWorkbenchPlugin } from './lib/workbench.plugin.js'
import { FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PLUGIN_NAMESPACE, PROVIDER_KEY, VIEW_KEY } from './lib/constants.js'
import { TEMPLATE_KEY, templates } from './lib/templates.js'

const version = z.object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))).version

const app = {
  type: 'app', name: 'testcase-workbench',
  displayName: { en_US: 'AI Test-case Workbench', zh_Hans: 'AI 测试用例工作台' },
  description: { en_US: 'Turn a requirement into draft test cases with AI, review and confirm them.', zh_Hans: '把需求交给 AI 生成测试用例草稿，逐条核对后确认保存。' },
  icon: { type: 'font', value: 'ri-list-check-2' },
  appConfig: {
    scope: 'organization', assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: { en_US: 'Test cases', zh_Hans: '测试用例工作空间' }, sharing: 'organization' },
    knowledgebases: [], modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'Reference a requirement, let the assistant draft cases, then confirm.', zh_Hans: '引用需求，助手起草用例，人工确认后保存。' },
      developer: 'jack1148',
      features: [
        { key: 'requirement', title: { en_US: 'Requirement form', zh_Hans: '需求录入' }, description: { en_US: 'Capture the requirement the cases will cover.', zh_Hans: '录入要被覆盖的需求，作为用例来源。' } },
        { key: 'drafting', title: { en_US: 'AI drafting', zh_Hans: 'AI 生成草稿' }, description: { en_US: 'The assistant writes structured draft cases and saves them as drafts.', zh_Hans: '助手生成结构化用例并保存为草稿。' } },
        { key: 'confirm', title: { en_US: 'Human confirm', zh_Hans: '人工确认' }, description: { en_US: 'Review, edit and confirm cases; data survives reload.', zh_Hans: '核对、编辑并确认用例，刷新后仍在。' } }
      ],
      dataScope: { en_US: 'Requirements and cases are private to each user and Assistant in the current workspace.', zh_Hans: '需求与用例按当前工作空间中的用户与助手隔离。' },
      initializationSummary: { en_US: 'Xpert prepares a dedicated workspace and the test-case assistant.', zh_Hans: 'Xpert 创建专用工作空间并初始化用例助手。' }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const configSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME, version, level: 'tenant', artifactNamespace: PLUGIN_NAMESPACE,
    displayName: 'AI Test-case Workbench',
    description: 'Turn a referenced requirement into AI-drafted test cases, confirm and persist them.',
    author: 'jack1148', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [FEATURE],
      marketplace: { contents: [app,
        { type: 'assistant-template', name: TEMPLATE_KEY,
          displayName: { en_US: 'Test Case Design Assistant', zh_Hans: '测试用例设计助手' },
          description: { en_US: 'Draft structured test cases from a referenced requirement.', zh_Hans: '根据引用的需求生成结构化用例草稿。' } },
        { type: 'view', name: VIEW_KEY, displayName: 'Test cases' }
      ] },
      runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [PROVIDER_KEY], templateProviders: ['testcase.templates'] }
    } }
  },
  config: { schema: configSchema },
  templates,
  register() { return { module: TestCaseWorkbenchPlugin, global: true } }
}

export default plugin
export { plugin }
