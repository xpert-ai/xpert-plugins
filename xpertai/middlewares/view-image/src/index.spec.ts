jest.mock('./lib/view-image.module.js', () => ({
  ViewImagePluginModule: class ViewImagePluginModule {}
}))

import plugin from './index.js'
import { ViewImagePluginModule } from './lib/view-image.module.js'
import { ViewImagePluginConfigFormSchema } from './lib/view-image.types.js'

describe('plugin-view-image', () => {
  it('exports plugin metadata and a loadable module', () => {
    const logger = {
      log: jest.fn()
    }

    expect(plugin.meta.displayName).toBe('View Image')
    expect(plugin.meta.description).toContain('view_image')
    expect(plugin.meta.description).toContain('sandbox image')
    expect(plugin.register({ logger } as any)).toEqual({
      module: ViewImagePluginModule,
      global: true
    })
    expect(logger.log).toHaveBeenCalledWith('register view image plugin')
  })

  it('has the expected keywords', () => {
    expect(plugin.meta.keywords).toContain('image')
    expect(plugin.meta.keywords).toContain('vision')
    expect(plugin.meta.keywords).toContain('middleware')
  })

  it('keeps plugin-level configuration empty', () => {
    expect(plugin.config?.formSchema).toEqual(ViewImagePluginConfigFormSchema)
    expect(plugin.config?.formSchema.properties).toEqual({})
  })
})
