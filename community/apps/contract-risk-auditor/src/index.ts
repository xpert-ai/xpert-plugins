import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ContractRiskAuditorPlugin } from './lib/contract-risk-auditor.plugin.js'
import {
  CONTRACT_RISK_AUDITOR_ARTIFACT_NAMESPACE,
  CONTRACT_RISK_AUDITOR_FEATURE,
  CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME,
  CONTRACT_RISK_AUDITOR_PROVIDER_KEY,
  CONTRACT_RISK_AUDITOR_TEMPLATE_PROVIDER_KEY,
  CONTRACT_RISK_AUDITOR_VIEW_KEY,
  CONTRACT_RISK_ICON
} from './lib/constants.js'
import { contractRiskAuditorTemplates } from './lib/contract-risk-auditor.templates.js'

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
    artifactNamespace: CONTRACT_RISK_AUDITOR_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          CONTRACT_RISK_AUDITOR_FEATURE,
          'contract-risk-workbench',
          'contract-risk-auditor-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'contract-risk-auditor',
              displayName: 'Contract Risk Auditor',
              description:
                'Scan procurement contracts for legal risks, excessive liabilities, and harsh clauses with AI-assisted review.',
              icon: {
                type: 'svg',
                value: CONTRACT_RISK_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'audit-contract-clauses',
                  displayName: 'Audit contract clauses',
                  description: 'Scan contract text and extract high-risk legal clauses.',
                  access: 'write'
                },
                {
                  name: 'review-and-revise',
                  displayName: 'Review and revise clauses',
                  description: 'Apply anti-breach revision recommendations to the contract.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: CONTRACT_RISK_AUDITOR_VIEW_KEY,
              displayName: 'Contract Risk Auditor Workbench',
              description: 'Interactive workbench for contract clause scanning, risk review, and revision.'
            },
            {
              type: 'tool',
              name: CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME,
              displayName: 'Contract Risk Auditor Tools',
              description: 'Assistant middleware tools for scanning clauses, accepting revisions, and persisting audits.'
            },
            {
              type: 'assistant-template',
              name: 'contract-risk-auditor-assistant',
              displayName: 'Contract Risk Auditor Assistant Template',
              description: 'Prebuilt assistant workflow template for contract risk auditing and negotiation support.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [CONTRACT_RISK_AUDITOR_MIDDLEWARE_NAME],
          viewProviders: [CONTRACT_RISK_AUDITOR_PROVIDER_KEY],
          templateProviders: [CONTRACT_RISK_AUDITOR_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CONTRACT_RISK_ICON,
      color: '#2563eb'
    },
    displayName: 'Contract Risk Auditor',
    description: '商务采购合同风险排查与防违约条款修订工作台',
    keywords: ['contract', 'legal', 'risk-audit', 'middleware', 'view-extension', 'remote-component', 'assistant-template'],
    author: 'Candidate'
  },
  config: {
    schema: ConfigSchema
  },
  templates: contractRiskAuditorTemplates,
  register(ctx) {
    ctx.logger.log('register contract risk auditor plugin')
    return { module: ContractRiskAuditorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('contract risk auditor plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('contract risk auditor plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/contract-risk-auditor.plugin.js'
export * from './lib/contract-risk-auditor.service.js'
export * from './lib/contract-risk-auditor.middleware.js'
export * from './lib/contract-risk-auditor-view.provider.js'
export * from './lib/contract-risk-auditor.templates.js'
