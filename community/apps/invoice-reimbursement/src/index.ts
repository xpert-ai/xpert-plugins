import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { InvoiceReimbursementPlugin } from './lib/invoice-reimbursement.plugin.js'
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_COMPANY_TAX_NO,
  INVOICE_ICON,
  INVOICE_REIMBURSEMENT_FEATURE,
  INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME,
  INVOICE_REIMBURSEMENT_PROVIDER_KEY,
  INVOICE_REIMBURSEMENT_TEMPLATE_PROVIDER_KEY,
  INVOICE_REIMBURSEMENT_VIEW_KEY
} from './lib/constants.js'
import { invoiceReimbursementTemplates } from './lib/invoice-reimbursement.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

let packageJson = {
  name: '@xpert-ai/plugin-invoice-reimbursement',
  version: '0.1.0'
}
try {
  packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8'))
} catch {
  // fallback default
}

const ConfigSchema = z.object({
  companyName: z.string().default(DEFAULT_COMPANY_NAME).describe('企业法定基准抬头'),
  companyTaxNo: z.string().default(DEFAULT_COMPANY_TAX_NO).describe('企业统一社会信用代码/税号')
})

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
          INVOICE_REIMBURSEMENT_FEATURE,
          'invoice-parsing-audit',
          'invoice-reimbursement-workbench',
          'invoice-reimbursement-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'invoice-reimbursement',
              displayName: 'Invoice Reimbursement Pre-audit',
              description:
                'AI-assisted invoice parsing, tax compliance check, human-in-the-loop review, and expense ledger.',
              icon: {
                type: 'svg',
                value: INVOICE_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'parse-and-audit-invoice',
                  displayName: 'Parse & Audit Invoice',
                  description: 'Extract structured items and verify tax compliance from raw invoice texts.',
                  access: 'write'
                },
                {
                  name: 'save-invoice-reimbursement',
                  displayName: 'Save Reimbursement Record',
                  description: 'Save human-verified invoice reimbursement records to database.',
                  access: 'write'
                },
                {
                  name: 'query-reimbursement-ledger',
                  displayName: 'Query Reimbursement Ledger',
                  description: 'Query company expense records, status, and total amounts.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: INVOICE_REIMBURSEMENT_VIEW_KEY,
              displayName: 'Invoice Reimbursement Workbench',
              description: 'Workbench view for invoice OCR parsing, compliance pre-audit, and expense records.'
            },
            {
              type: 'tool',
              name: INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME,
              displayName: 'Invoice Reimbursement Tools',
              description: 'Assistant middleware tools for invoice parsing, compliance checking, and ledger committing.'
            },
            {
              type: 'assistant-template',
              name: 'invoice-reimbursement-assistant',
              displayName: 'Invoice Reimbursement Assistant Template',
              description: 'Prebuilt workflow assistant for invoice extraction, audit, and ledger recording.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME],
          viewProviders: [INVOICE_REIMBURSEMENT_PROVIDER_KEY],
          templateProviders: [INVOICE_REIMBURSEMENT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: INVOICE_ICON,
      color: '#2563eb'
    },
    displayName: 'Invoice Reimbursement Pre-audit',
    description:
      'Enterprise invoice reimbursement pre-audit and compliance review agentic app with workbench view.',
    keywords: ['invoice', 'reimbursement', 'tax-compliance', 'middleware', 'workbench-view', 'agentic-app'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: invoiceReimbursementTemplates,
  register(ctx) {
    ctx.logger.log('Register invoice reimbursement plugin')
    return { module: InvoiceReimbursementPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Invoice reimbursement plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Invoice reimbursement plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/invoice-reimbursement.plugin.js'
export * from './lib/invoice-reimbursement.service.js'
export * from './lib/invoice-reimbursement.middleware.js'
export * from './lib/invoice-reimbursement-view.provider.js'
export * from './lib/invoice-reimbursement.templates.js'
