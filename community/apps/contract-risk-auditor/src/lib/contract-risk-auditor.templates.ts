import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CONTRACT_RISK_AUDITOR_FEATURE,
  CONTRACT_RISK_AUDITOR_PLUGIN_NAME,
  CONTRACT_RISK_AUDITOR_PROVIDER_KEY
} from './constants.js'

const CONTRACT_RISK_TEMPLATE_KEY = 'contract-risk-auditor-assistant'
const CONTRACT_RISK_TEMPLATE_FILE = 'xpert-contract-risk-auditor-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', CONTRACT_RISK_TEMPLATE_FILE),
    join(runtimeDir, CONTRACT_RISK_TEMPLATE_FILE),
    join(process.cwd(), 'apps/contract-risk-auditor/src', CONTRACT_RISK_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/contract-risk-auditor/src', CONTRACT_RISK_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/contract-risk-auditor', CONTRACT_RISK_TEMPLATE_FILE)
  ]
}

function readContractRiskDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Contract Risk Auditor DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const contractRiskAuditorTemplates: XpertTemplateContribution[] = [
  {
    key: CONTRACT_RISK_TEMPLATE_KEY,
    name: 'Contract Risk Auditor Assistant',
    title: '合同风险排查助手',
    description: '面向商务采购合同风险排查、霸王条款识别、权利义务对等性核验及防违约修订建议的业务助手模板。',
    category: 'Procurement',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CONTRACT_RISK_AUDITOR_FEATURE, 'contract-risk-workbench'],
        requiredPlugins: [CONTRACT_RISK_AUDITOR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'contract-risk-auditor',
          managedBy: 'data-xpert',
          viewProvider: CONTRACT_RISK_AUDITOR_PROVIDER_KEY
        }
      }
    },
    template: {
      format: 'yaml',
      dsl: readContractRiskDsl()
    }
  }
]
