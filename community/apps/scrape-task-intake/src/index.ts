import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  ScrapeTaskIntakePluginConfigFormSchema,
  ScrapeTaskIntakePluginConfigSchema,
  readScrapeTaskIntakePluginEnvDefaults
} from './lib/scrape-task-intake.config'
import { ScrapeTaskIntakePlugin } from './lib/scrape-task-intake.plugin'
import {
  SCRAPE_TASK_INTAKE_FEATURE,
  SCRAPE_TASK_INTAKE_ICON,
  SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME,
  SCRAPE_TASK_INTAKE_PROVIDER_KEY,
  SCRAPE_TASK_INTAKE_TEMPLATE_PROVIDER_KEY,
  SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { scrapeTaskIntakeTemplates } from './lib/scrape-task-intake.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = ScrapeTaskIntakePluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          SCRAPE_TASK_INTAKE_FEATURE,
          'scrape-request-entry',
          'scrape-task-review-desk',
          'scrape-task-intake-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'scrape-task-intake',
              displayName: 'Scrape Task Intake',
              description:
                'Turn natural-language scraping requests into reviewable structured task specs, with human confirmation and collection status tracking.',
              icon: {
                type: 'svg',
                value: SCRAPE_TASK_INTAKE_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'create-scrape-tasks',
                  displayName: 'Create scrape tasks',
                  description: 'Generate reviewable scraping task specs from natural-language collection requests.',
                  access: 'write'
                },
                {
                  name: 'review-scrape-tasks',
                  displayName: 'Review scrape tasks',
                  description: 'Review, supplement, confirm, start, complete or reject scraping task specs.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY,
              displayName: 'Scrape Task Intake Workbench',
              description: 'Workbench view for scraping request intake, task spec review and collection status tracking.'
            },
            {
              type: 'tool',
              name: SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME,
              displayName: 'Scrape Task Intake Tools',
              description:
                'Assistant middleware tools for saving generated task specs, getting field templates, searching tasks and preparing supplement drafts.'
            },
            {
              type: 'assistant-template',
              name: 'scrape-task-intake-assistant',
              displayName: 'Scrape Task Intake Assistant Template',
              description:
                'Prebuilt assistant workflow template for scraping request intake, task spec generation and review support.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME],
          viewProviders: [SCRAPE_TASK_INTAKE_PROVIDER_KEY],
          templateProviders: [SCRAPE_TASK_INTAKE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SCRAPE_TASK_INTAKE_ICON,
      color: '#0f766e'
    },
    displayName: 'Scrape Task Intake',
    description: 'Turn natural-language scraping requests into reviewable structured task specs with status tracking.',
    keywords: ['scraping', 'task-intake', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'DaShengGuo'
  },
  config: {
    schema: ConfigSchema,
    formSchema: ScrapeTaskIntakePluginConfigFormSchema,
    defaults: readScrapeTaskIntakePluginEnvDefaults()
  },
  templates: scrapeTaskIntakeTemplates,
  register(ctx) {
    ctx.logger.log('register scrape-task-intake plugin')
    return { module: ScrapeTaskIntakePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('scrape-task-intake plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('scrape-task-intake plugin stopped')
  }
}

export default plugin
