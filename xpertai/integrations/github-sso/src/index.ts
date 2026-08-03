import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { GITHUB_SSO_PLUGIN_RUNTIME_METADATA, GITHUB_SSO_PROVIDER } from './lib/constants.js'
import { GitHubSsoPluginModule } from './lib/github-sso.module.js'
import { GITHUB_SSO_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const GitHubSsoPluginConfigSchema = z.object({})
type GitHubSsoPluginConfig = z.infer<typeof GitHubSsoPluginConfigSchema>

const plugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    ...GITHUB_SSO_PLUGIN_RUNTIME_METADATA,
    category: 'integration',
    icon: {
      type: 'font',
      value: 'ri-github-fill'
    },
    displayName: 'GitHub SSO',
    description: 'Adds tenant-configured GitHub OAuth sign-in and verified-email provisioning to Xpert.',
    keywords: ['github', 'oauth', 'identity', 'sso', 'sign-in'],
    author: 'XpertAI Team'
  },
  config: {
    schema: GitHubSsoPluginConfigSchema,
    defaults: {}
  },
  permissions: [
    {
      type: 'integration',
      service: GITHUB_SSO_PROVIDER,
      operations: ['read']
    },
    {
      type: 'bound_identity_login',
      operations: ['provision'],
      providers: [GITHUB_SSO_PROVIDER]
    }
  ],
  register(ctx) {
    ctx.logger.log('register github sso plugin')
    return {
      module: GitHubSsoPluginModule,
      global: true,
      providers: [
        {
          provide: GITHUB_SSO_PLUGIN_CONTEXT,
          useValue: ctx
        }
      ]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('github sso plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('github sso plugin stopped')
  }
} satisfies XpertPlugin<GitHubSsoPluginConfig>

export default plugin
