import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { rfidConfigSchema } from './lib/experiment-contracts.js'
import { RfidExperimentInsightPlugin } from './lib/rfid-experiment-insight.plugin.js'
import { rfidExperimentInsightTemplates } from './lib/rfid-experiment-insight.templates.js'
import { RFID_ARTIFACT_NAMESPACE, RFID_FEATURE, RFID_ICON, RFID_MIDDLEWARE_NAME, RFID_TEMPLATE_KEY, RFID_TEMPLATE_PROVIDER_KEY, RFID_PROVIDER_KEY, RFID_VIEW_KEY } from './lib/rfid-constants.js'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string }

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name, version: packageJson.version, level: 'system', artifactNamespace: RFID_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'], category: 'middleware',
    displayName: 'RFID Experiment Insight',
    description: 'Validate experiment CSV, compute deterministic statistics, and let an Assistant interpret and save results for review.',
    icon: { type: 'svg', value: RFID_ICON, color: '#0f766e' },
    keywords: ['rfid', 'experiment', 'assistant-template', 'middleware'], author: 'XpertAI Team',
    targetAppMeta: { 'data-xpert': {
      types: ['workbench-view', 'assistant-tool', 'business-app'], capabilities: [RFID_FEATURE],
      marketplace: { contents: [
        { type: 'view', name: RFID_VIEW_KEY, displayName: 'RFID Experiment Insight Workbench', description: 'Upload experiment CSV, review statistics and Assistant interpretation, confirm results and reopen history.' },
        { type: 'tool', name: RFID_MIDDLEWARE_NAME, displayName: 'RFID Experiment Insight Tools', description: 'Read deterministic statistics and save Assistant interpretations for user review.' },
        { type: 'assistant-template', name: RFID_TEMPLATE_KEY, displayName: 'RFID Experiment Insight Assistant', description: 'Interpret experiment statistics using a configured real model and registered tools.' }
      ] },
      runtime: { middlewareProviders: [RFID_MIDDLEWARE_NAME], templateProviders: [RFID_TEMPLATE_PROVIDER_KEY], viewProviders: [RFID_PROVIDER_KEY] }
    } }
  },
  config: { schema: rfidConfigSchema }, templates: rfidExperimentInsightTemplates,
  register(ctx) { ctx.logger.log('Register RFID Experiment Insight'); return { module: RfidExperimentInsightPlugin, global: true } },
  async onStart(ctx) { ctx.logger.log('RFID Experiment Insight started') },
  async onStop(ctx) { ctx.logger.log('RFID Experiment Insight stopped') }
}
export default plugin
export * from './lib/rfid-constants.js'
export * from './lib/experiment-contracts.js'
export * from './lib/experiment-statistics.js'
export * from './lib/entities/experiment-analysis.entity.js'
export * from './lib/rfid-experiment-insight.service.js'
export * from './lib/rfid-experiment-insight.middleware.js'
export * from './lib/rfid-experiment-insight.plugin.js'
export * from './lib/rfid-experiment-insight.templates.js'
export * from './lib/rfid-experiment-insight-view.provider.js'
