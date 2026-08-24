import { DingTalkSsoPluginConfigSchema } from './plugin-config.js'

describe('DingTalkSsoPluginConfigSchema', () => {
  it('keeps OAuth credentials out of plugin configuration', () => {
    expect(DingTalkSsoPluginConfigSchema.parse({})).toEqual({})
    expect(DingTalkSsoPluginConfigSchema.parse({ clientId: 'ignored' })).toEqual({})
  })
})
