import { materialIdentityApp } from './app-config.js'
import { MATERIAL_PACKAGE_METADATA } from './package-metadata.js'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  APP_ICON,
  PLUGIN_NAME,
  ARTIFACT_NAMESPACE,
  PLUGIN_VERSION,
  artifactKey,
} from './lib/artifact-namespace.js'
import { templates } from './lib/assistant-templates.js'
import { ROLES, WORKBENCH_FEATURE } from './lib/roles.js'
import { ConfigSchema, RUNTIME_SCOPE } from './lib/server/config.js'
import { MaterialGovernancePlugin } from './lib/server/plugin.module.js'
const capabilities = [...ROLES.map((r) => r.feature), WORKBENCH_FEATURE]
const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: MATERIAL_PACKAGE_METADATA.name,
    version: MATERIAL_PACKAGE_METADATA.version,
    level: MATERIAL_PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: MATERIAL_PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: '物料主数据智能治理',
    description:
      'Evidence-governed material identity management for automotive components.',
    author: 'XpertAI',
    icon: APP_ICON,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: Object.fromEntries(
      ['data-xpert', 'xpert'].map((key) => [
        key,
        {
          types: ['business-app', 'assistant-template', 'workbench-view'],
          capabilities,
          marketplace: { contents: [materialIdentityApp] },
          runtime: {
            middlewareProviders: ROLES.map((r) => r.middleware),
            viewProviders: [artifactKey('views')],
            templateProviders: [artifactKey('templates')],
          },
        },
      ]),
    ),
  },
  config: { schema: ConfigSchema, defaults: { mode: 'mock', debug: false } },
  templates,
  register(ctx) {
    return {
      module: MaterialGovernancePlugin,
      global: true,
      providers: [
        {
          provide: RUNTIME_SCOPE,
          useValue: { scopeKey: ctx.scopeKey ?? 'global', tenantId: ctx.tenantId },
        },
      ],
      exports: [RUNTIME_SCOPE],
    }
  },
}
export default plugin
export { templates }
