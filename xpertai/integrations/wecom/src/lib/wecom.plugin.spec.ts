import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { WeComIntegrationViewProvider } from './views/wecom-integration-view.provider.js'
import { WeComPlugin } from './wecom.plugin.js'

describe('WeComPlugin', () => {
  it('registers the integration view provider so detail tabs are discoverable', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WeComPlugin) as unknown[]

    expect(providers).toContain(WeComIntegrationViewProvider)
  })
})
