import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { SitesPluginConfigFormSchema, SitesPluginConfigSchema, readSitesPluginEnvDefaults } from './lib/sites.config.js'
import {
  SITES_FEATURE,
  SITES_ICON,
  SITES_MIDDLEWARE_NAME,
  SITES_PROVIDER_KEY,
  SITES_TEMPLATE_PROVIDER_KEY,
  SITES_VIEW_KEY
} from './lib/constants.js'
import { SitesPlugin } from './lib/sites.plugin.js'
import { sitesTemplates } from './lib/sites.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = SitesPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app', 'site-hosting'],
        capabilities: [SITES_FEATURE, 'sites-workbench', 'sites-builder-assistant-template', 'sites-local-hosting'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'sites',
              displayName: 'Sites',
              description:
                'Create, save, deploy, inspect, and manage access for hosted Sites projects from data-xpert Assistants.',
              icon: {
                type: 'svg',
                value: SITES_ICON,
                color: '#4f46e5'
              },
              operations: [
                {
                  name: 'create-sites-projects',
                  displayName: 'Create Sites projects',
                  description: 'Create local Sites projects with hosting metadata and storage shape.',
                  access: 'write'
                },
                {
                  name: 'save-sites-versions',
                  displayName: 'Save deployable versions',
                  description: 'Save reviewable deployment candidates before production publish.',
                  access: 'write'
                },
                {
                  name: 'deploy-sites-versions',
                  displayName: 'Deploy Sites versions',
                  description: 'Publish approved saved versions and return user-facing preview URLs plus permission-controlled deployment URLs.',
                  access: 'admin'
                }
              ]
            },
            {
              type: 'view',
              name: SITES_VIEW_KEY,
              displayName: 'Sites Workbench',
              description: 'Workbench view for Sites projects, versions, deployments, access, and environment values.'
            },
            {
              type: 'tool',
              name: SITES_MIDDLEWARE_NAME,
              displayName: 'Sites Agent Tools',
              description:
                'Assistant middleware tools for project creation, saved versions, deployments, user-facing preview URLs, access control, and hosted environment values.'
            },
            {
              type: 'assistant-template',
              name: 'sites-builder-assistant',
              displayName: 'Sites Builder Assistant Template',
              description: 'Prebuilt assistant template for creating and managing hosted Sites.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SITES_MIDDLEWARE_NAME],
          viewProviders: [SITES_PROVIDER_KEY],
          templateProviders: [SITES_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SITES_ICON,
      color: '#4f46e5'
    },
    displayName: 'Sites',
    description: 'Sites plugin for creating, saving, deploying, inspecting, and managing hosted sites.',
    keywords: ['sites', 'hosting', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SitesPluginConfigFormSchema,
    defaults: readSitesPluginEnvDefaults()
  },
  templates: sitesTemplates,
  register(ctx) {
    ctx.logger.log('register sites plugin')
    return { module: SitesPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('sites plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('sites plugin stopped')
  }
}

export default plugin
