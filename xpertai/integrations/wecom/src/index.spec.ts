import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WECOM_ARTIFACT_NAMESPACE, WECOM_PLUGIN_RUNTIME_METADATA } from './lib/constants.js'

type PackageMetadata = {
  xpert?: {
    plugin?: {
      level?: string
      artifactNamespace?: string
    }
  }
}

describe('wecom plugin metadata', () => {
  it('keeps package and runtime metadata aligned', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as PackageMetadata

    expect(WECOM_PLUGIN_RUNTIME_METADATA).toEqual({
      level: 'system',
      artifactNamespace: WECOM_ARTIFACT_NAMESPACE
    })
    expect(packageJson.xpert?.plugin).toEqual({
      level: 'system',
      artifactNamespace: WECOM_ARTIFACT_NAMESPACE
    })
  })
})
