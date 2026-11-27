import 'reflect-metadata'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { RequirementReviewPlugin } from './plugin.module.js'
import { PLUGIN_NAME, PLUGIN_ARTIFACT_NAMESPACE } from './constants.js'
import { FEATURE, PROVIDER } from './constants.js'
import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'

const configSchema = z.object({ debug: z.boolean().optional() }).strict()
const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: '0.1.0',
    level: 'system',
    artifactNamespace: PLUGIN_ARTIFACT_NAMESPACE,
    displayName: 'ReqTrace',
    author: 'ReqTrace',
    description:
      'Requirement evidence review and human confirmation workbench.',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-template'],
        capabilities: [FEATURE],
        runtime: { middlewareProviders: [PROVIDER], viewProviders: [PROVIDER] }
      }
    }
  },
  config: { schema: configSchema },
  templates: [
    {
      key: 'reqtrace-review-assistant',
      name: 'ReqTrace Review Assistant',
      title: 'ReqTrace 需求评审助手',
      description: '访谈原文 → 需求证据草稿 → 人工核对 → 确认保存',
      category: 'Productivity',
      type: XpertTypeEnum.Agent,
      targetApps: ['xpert'],
      targetAppMeta: {
        xpert: {
          types: ['assistant-template'],
          capabilities: [FEATURE],
          requiredPlugins: [PLUGIN_NAME]
        }
      },
      dependencies: { plugins: [PLUGIN_NAME] },
      dslContent: readFileSync(
        new URL('./assistant.yaml', import.meta.url),
        'utf8'
      ),
      order: 20,
      startPrompts: ['打开需求评审工作台，新建访谈评审。']
    }
  ],
  register() {
    return { module: RequirementReviewPlugin, global: true }
  }
}

export default plugin
export { plugin }
