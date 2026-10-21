import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ContractHealthCheckPlugin } from './lib/contract-health-check.plugin.js'
import {
  CONTRACT_HEALTH_CHECK_FEATURE,
  CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME,
  CONTRACT_HEALTH_CHECK_PROVIDER_KEY,
  CONTRACT_HEALTH_CHECK_TEMPLATE_PROVIDER_KEY,
  CONTRACT_HEALTH_CHECK_VIEW_KEY,
  CONTRACT_ICON
} from './lib/constants.js'
import { contractHealthCheckTemplates } from './lib/contract-health-check.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          CONTRACT_HEALTH_CHECK_FEATURE,
          'contract-health-check-workbench',
          'contract-review-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'contract-health-check',
              displayName: 'Contract Health Check',
              description:
                'Create contract reviews, run AI risk review with rewrite suggestions, confirm findings, and save a reviewable report.',
              icon: {
                type: 'svg',
                value: CONTRACT_ICON,
                color: '#1d4ed8'
              },
              operations: [
                {
                  name: 'create-contract-reviews',
                  displayName: 'Create contract reviews',
                  description: 'Create contract reviews from pasted contract text.',
                  access: 'write'
                },
                {
                  name: 'run-contract-risk-review',
                  displayName: 'Run contract risk review',
                  description: 'Use assistant tools to save extraction, risks, suggestions, and summary.',
                  access: 'write'
                },
                {
                  name: 'review-contract-findings',
                  displayName: 'Review contract findings',
                  description: 'Confirm each risk decision and save the health-check report.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: CONTRACT_HEALTH_CHECK_VIEW_KEY,
              displayName: 'Contract Health Check Workbench',
              description: 'Workbench view for contract reviews, risks, rewrite suggestions, and reports.'
            },
            {
              type: 'tool',
              name: CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME,
              displayName: 'Contract Health Check Tools',
              description:
                'Assistant middleware tools for saving contract extraction, risks, suggestions, summary, and failures.'
            },
            {
              type: 'assistant-template',
              name: 'contract-health-check-assistant',
              displayName: 'Contract Health Check Assistant Template',
              description:
                'Prebuilt assistant workflow template for contract extraction, risk review, rewrite suggestions, and reporting.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME],
          viewProviders: [CONTRACT_HEALTH_CHECK_PROVIDER_KEY],
          templateProviders: [CONTRACT_HEALTH_CHECK_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CONTRACT_ICON,
      color: '#1d4ed8'
    },
    displayName: 'Contract Health Check',
    description:
      'Create contract reviews, run AI risk review with an Xpert, and expose a contract health-check workbench view.',
    keywords: [
      'contract',
      'legal',
      'risk-review',
      'middleware',
      'view-extension',
      'assistant-template'
    ],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: contractHealthCheckTemplates,
  register(ctx) {
    ctx.logger.log('register contract health check plugin')
    return { module: ContractHealthCheckPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('contract health check plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('contract health check plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/contract-health-check.plugin.js'
export * from './lib/contract-health-check.service.js'
export * from './lib/contract-health-check.middleware.js'
export * from './lib/contract-health-check-view.provider.js'
export * from './lib/contract-health-check.templates.js'
