import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  RegistrationPluginConfigFormSchema,
  RegistrationPluginConfigSchema,
  readRegistrationPluginEnvDefaults
} from './lib/registration.config'
import {
  FEATURE,
  ICON,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PROVIDER_KEY,
  TEMPLATE_PROVIDER_KEY,
  WORKBENCH_VIEW_KEY
} from './lib/constants'
import { RegistrationPlugin } from './lib/registration.plugin'
import { registrationTemplates } from './lib/registration.templates'

const moduleDir = __dirname
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = RegistrationPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || PLUGIN_NAME,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool', 'assistant-template'],
        capabilities: [
          FEATURE,
          'registration-analytics-workbench',
          'registration-analytics-agent-tools',
          'registration-analytics-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'registration-analytics',
              displayName: 'Registration Analytics',
              description:
                'Use an Xpert-native registration analytics console to query and analyze registration records with natural language.',
              icon: {
                type: 'svg',
                value: ICON,
                color: '#0e7490'
              },
              operations: [
                {
                  name: 'query-registrations',
                  displayName: 'Query registrations',
                  description: 'Query and aggregate registration records from natural language questions.',
                  access: 'read'
                },
                {
                  name: 'review-registration-workbench',
                  displayName: 'Review registration workbench',
                  description: 'Use the registration analytics workbench to inspect and query registration data.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: WORKBENCH_VIEW_KEY,
              displayName: 'Registration Console',
              description: 'Registration analytics console for querying and analyzing registration records.'
            },
            {
              type: 'tool',
              name: MIDDLEWARE_NAME,
              displayName: 'Registration Analytics Tools',
              description:
                'Assistant middleware tools for listing activities, querying registrations, saving and listing saved queries.'
            },
            {
              type: 'assistant-template',
              name: 'registration-analytics-assistant',
              displayName: 'Registration Analytics Assistant Template',
              description: 'Prebuilt Assistant template for Xpert-native registration data query and analysis.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: [TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ICON,
      color: '#0e7490'
    },
    displayName: 'Registration Analytics',
    description: 'Xpert-native registration analytics plugin with natural-language-driven data querying.',
    keywords: ['registration', 'analytics', 'query', 'workbench', 'agent-tool', 'assistant-template'],
    author: 'Hilbertangers'
  },
  config: {
    schema: ConfigSchema,
    formSchema: RegistrationPluginConfigFormSchema,
    defaults: readRegistrationPluginEnvDefaults()
  },
  templates: registrationTemplates,
  register(ctx) {
    ctx.logger.log('register registration-analytics plugin')
    return { module: RegistrationPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('registration-analytics plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('registration-analytics plugin stopped')
  }
}

export default plugin
