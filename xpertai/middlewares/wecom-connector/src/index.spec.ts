import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './index.js'
import {
  WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
  WECOM_CONNECTOR_ICON,
  WECOM_CONNECTOR_INSTALL_LEVEL
} from './lib/types.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  ConnectorStrategyKey: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE',
  IntegrationStrategyKey: () => () => undefined,
  XpertServerPlugin: () => () => undefined
}))

type PackageMetadata = {
  xpert?: {
    plugin?: {
      level?: string
      artifactNamespace?: string
    }
  }
}

describe('WeCom connector plugin metadata', () => {
  it('keeps package and runtime metadata aligned', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as PackageMetadata

    expect(plugin.meta.level).toBe(WECOM_CONNECTOR_INSTALL_LEVEL)
    expect(plugin.meta.artifactNamespace).toBe(WECOM_CONNECTOR_ARTIFACT_NAMESPACE)
    expect(packageJson.xpert?.plugin).toEqual({
      level: WECOM_CONNECTOR_INSTALL_LEVEL,
      artifactNamespace: WECOM_CONNECTOR_ARTIFACT_NAMESPACE
    })
    expect(plugin.meta.icon).toEqual({ type: 'svg', value: WECOM_CONNECTOR_ICON })
  })
})
