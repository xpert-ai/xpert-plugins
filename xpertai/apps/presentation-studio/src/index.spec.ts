import plugin from './index.js'
import {
  PRESENTATION_COLLABORATION_CAPABILITY,
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_WORKBENCH_CAPABILITY
} from './lib/constants.js'

describe('Presentation Studio plugin', () => {
  it('publishes aligned system Agentic App metadata', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-presentation-studio')
    expect(plugin.meta.version).toBe('0.1.0')
    expect(plugin.meta.level).toBe('system')
    expect(plugin.meta.targetApps).toEqual(['data-xpert', 'xpert'])
    const capabilities = plugin.meta.targetAppMeta?.['data-xpert']?.capabilities ?? []
    expect(capabilities).toEqual(expect.arrayContaining([
      PRESENTATION_FEATURE,
      PRESENTATION_GENERATION_CAPABILITY,
      PRESENTATION_WORKBENCH_CAPABILITY,
      PRESENTATION_COLLABORATION_CAPABILITY,
      PRESENTATION_EXPORT_CAPABILITY
    ]))
    expect(plugin.templates).toHaveLength(1)
    expect(plugin.config?.defaults).toEqual(expect.objectContaining({ exportBackend: 'sandbox-job' }))
    expect(plugin.config?.defaults).not.toHaveProperty('sandboxExportEnabled')
  })
})
