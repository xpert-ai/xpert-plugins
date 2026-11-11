import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { RoadEventCommandCenterPlugin } from './lib/road-event-command-center.plugin.js'
import {
  FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PLUGIN_NAMESPACE,
  PROVIDER_KEY,
  TEMPLATE_KEY,
  VIEW_KEY
} from './lib/constants.js'
import { roadEventAssistantTemplate } from './lib/templates.js'

const packageMetadata = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string }
const configSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: packageMetadata.version,
    level: 'tenant',
    artifactNamespace: PLUGIN_NAMESPACE,
    displayName: 'Road Event Command Center',
    description: 'AI-assisted road event review and command workbench.',
    author: '739618398',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [FEATURE],
        marketplace: {
          contents: [
            {
              type: 'assistant-template',
              name: TEMPLATE_KEY,
              displayName: { en_US: 'Road Event Draft Assistant', zh_Hans: '道路事件草稿助手' },
              description: {
                en_US: 'A starter Assistant with the road-event draft workbench enabled.',
                zh_Hans: '预先启用道路事件草稿工作台的起步助手模板。'
              }
            },
            {
              type: 'view',
              name: VIEW_KEY,
              displayName: 'Road Event Command Center',
              description: 'Vue 3 workbench for road event draft capture.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: ['road-event-command-center.templates']
        }
      }
    }
  },
  config: { schema: configSchema },
  templates: [roadEventAssistantTemplate],
  register() {
    return { module: RoadEventCommandCenterPlugin, global: true }
  }
}

export default plugin
export { plugin }
