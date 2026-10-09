import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  ContractReviewPluginConfigSchema,
  ContractReviewPluginConfigFormSchema,
  readContractReviewPluginEnvDefaults
} from './lib/contract-review.config'
import {
  CONTRACT_REVIEW_ARTIFACT_NAMESPACE,
  CONTRACT_REVIEW_FEATURE,
  CONTRACT_REVIEW_ICON,
  CONTRACT_REVIEW_MIDDLEWARE_NAME,
  CONTRACT_REVIEW_PLUGIN_NAME,
  CONTRACT_REVIEW_PROVIDER_KEY,
  CONTRACT_REVIEW_TEMPLATE_PROVIDER_KEY,
  CONTRACT_REVIEW_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { ContractReviewPlugin } from './lib/contract-review.plugin'
import { contractReviewTemplates } from './lib/contract-review.templates'

const moduleDir = __dirname
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = ContractReviewPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || CONTRACT_REVIEW_PLUGIN_NAME,
    version: packageJson.version,
    level: 'organization',
    // 显式声明数据契约命名空间：两张表固定为 plugin_contract_review_*，发布后不可更改。
    artifactNamespace: CONTRACT_REVIEW_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [
          CONTRACT_REVIEW_FEATURE,
          CONTRACT_REVIEW_WORKBENCH_VIEW_KEY,
          'contract-review-agent-tools',
          'contract-review-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'contract-review',
              displayName: 'Contract Review',
              description:
                'Review a contract with an Agent that extracts payment, delivery, warranty and liability clauses, then confirm each clause by hand before it is saved.',
              icon: {
                type: 'svg',
                value: CONTRACT_REVIEW_ICON,
                color: '#1d4ed8'
              },
              operations: [
                {
                  name: 'review-contract-clauses',
                  displayName: 'Review contract clauses',
                  description:
                    'Extract and record the four key clause types from a contract, then confirm, correct or reject each one.',
                  access: 'write'
                },
                {
                  name: 'inspect-contract-review',
                  displayName: 'Inspect contract review',
                  description: 'Read saved reviews and the recorded clause conclusions.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: CONTRACT_REVIEW_WORKBENCH_VIEW_KEY,
              displayName: 'Contract Review Workbench',
              description: 'Paste a contract, run the Agent extraction, and confirm each clause by hand.'
            },
            {
              type: 'tool',
              name: CONTRACT_REVIEW_MIDDLEWARE_NAME,
              displayName: 'Contract Review Agent Tools',
              description: 'Agent tools for listing reviews, reading a contract, and recording extracted clauses.'
            },
            {
              type: 'assistant-template',
              name: 'contract-review-assistant',
              displayName: 'Contract Review Assistant Template',
              description: 'Prebuilt Assistant template for contract clause review.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [CONTRACT_REVIEW_MIDDLEWARE_NAME],
          viewProviders: [CONTRACT_REVIEW_PROVIDER_KEY],
          templateProviders: [CONTRACT_REVIEW_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CONTRACT_REVIEW_ICON,
      color: '#1d4ed8'
    },
    displayName: 'Contract Review',
    description:
      'Contract key-clause review workbench: an Agent extracts the clauses, a human confirms them, the conclusion is saved.',
    keywords: ['contract', 'review', 'clause', 'risk', 'workbench', 'agent-tool', 'assistant-template'],
    author: 'BANG404'
  },
  config: {
    schema: ConfigSchema,
    formSchema: ContractReviewPluginConfigFormSchema,
    defaults: readContractReviewPluginEnvDefaults()
  },
  templates: contractReviewTemplates,
  register(ctx) {
    ctx.logger.log('register contract review plugin')
    return { module: ContractReviewPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('contract review plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('contract review plugin stopped')
  }
}

export default plugin
