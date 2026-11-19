import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import plugin, { PLUGIN_ARTIFACT_NAMESPACE } from './index'
import { SupplierDeliveryFollowupPlugin } from './lib/supplier-delivery-followup.plugin'

describe('Supplier Delivery Follow-up plugin', () => {
  it('matches package metadata and registers its server module', () => {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

    expect(plugin.meta).toMatchObject({
      name: packageJson.name,
      version: packageJson.version,
      level: packageJson.xpert.plugin.level,
      artifactNamespace: packageJson.xpert.plugin.artifactNamespace
    })
    expect(PLUGIN_ARTIFACT_NAMESPACE).toBe(packageJson.xpert.plugin.artifactNamespace)
    expect(plugin.register()).toEqual({ module: SupplierDeliveryFollowupPlugin })
  })
})
