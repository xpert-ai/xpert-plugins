import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  readSqlReviewPluginEnvDefaults,
  SqlReviewPluginConfigFormSchema,
  SqlReviewPluginConfigSchema
} from './lib/sql-review.config'
import { SqlReviewPlugin } from './lib/sql-review.plugin'
import {
  SQL_REVIEW_FEATURE,
  SQL_REVIEW_ICON,
  SQL_REVIEW_MIDDLEWARE_NAME,
  SQL_REVIEW_PROVIDER_KEY,
  SQL_REVIEW_TEMPLATE_PROVIDER_KEY,
  SQL_REVIEW_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { sqlReviewTemplates } from './lib/sql-review.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = SqlReviewPluginConfigSchema

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
          SQL_REVIEW_FEATURE,
          'sql-review-submit',
          'sql-review-confirmation-desk',
          'sql-review-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'sql-review',
              displayName: 'SQL 质量审查',
              description:
                'Submit SQL for deterministic rule scan and AI-assisted structured review; humans confirm findings and archive the case.',
              icon: {
                type: 'svg',
                value: SQL_REVIEW_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'submit-sql-review',
                  displayName: 'Submit SQL for review',
                  description: 'Submit SQL (with optional DDL context) and get rule + AI findings on a review case.',
                  access: 'write'
                },
                {
                  name: 'confirm-findings',
                  displayName: 'Confirm findings',
                  description: 'Accept or reject each finding, then finalize the case as confirmed or rejected.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: SQL_REVIEW_WORKBENCH_VIEW_KEY,
              displayName: 'SQL 质量审查工作台',
              description: 'List review cases, inspect findings with evidence, decide each finding, retry failed cases.'
            },
            {
              type: 'tool',
              name: SQL_REVIEW_MIDDLEWARE_NAME,
              displayName: 'SQL Review Tools',
              description: 'Assistant middleware tools for submitting cases, reading rule findings and saving AI reports.'
            },
            {
              type: 'assistant-template',
              name: 'sql-review-assistant',
              displayName: 'SQL 质量审查助手模板',
              description: 'Prebuilt assistant template that runs rule scan plus AI analysis and files a review case.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SQL_REVIEW_MIDDLEWARE_NAME],
          viewProviders: [SQL_REVIEW_PROVIDER_KEY],
          templateProviders: [SQL_REVIEW_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SQL_REVIEW_ICON,
      color: '#0f766e'
    },
    displayName: 'SQL 质量审查',
    description: 'Deterministic rules + AI-assisted structured SQL review with human confirmation.',
    keywords: ['sql-review', 'database', 'workbench-view', 'agent-tool', 'assistant-template'],
    author: 'Xiexinzhe'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SqlReviewPluginConfigFormSchema,
    defaults: readSqlReviewPluginEnvDefaults()
  },
  templates: sqlReviewTemplates,
  register(ctx) {
    ctx.logger.log('register sql-review plugin')
    return { module: SqlReviewPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('sql-review plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('sql-review plugin stopped')
  }
}

export default plugin
