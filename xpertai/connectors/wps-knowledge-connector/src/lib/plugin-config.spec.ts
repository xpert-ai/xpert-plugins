import { WpsKnowledgePluginConfigFormSchema, WpsKnowledgePluginConfigSchema } from './plugin-config.js'

describe('WPS Knowledge plugin configuration', () => {
  it('requires no tenant credentials for SkillHub login', () => {
    expect(WpsKnowledgePluginConfigSchema.parse({})).toEqual({})
    expect(WpsKnowledgePluginConfigFormSchema).toEqual({ type: 'object', properties: {} })
  })

  it('rejects unrecognized configuration and secret-shaped fields', () => {
    expect(() => WpsKnowledgePluginConfigSchema.parse({ appId: 'unexpected' })).toThrow()
    expect(() => WpsKnowledgePluginConfigSchema.parse({ appKey: 'unexpected' })).toThrow()
  })
})
