jest.mock('./lib/mineru-cli.module.js', () => ({
  MinerUCliPluginModule: class MinerUCliPluginModule {}
}))

import plugin from './index.js'
import { MinerUCliPluginModule } from './lib/mineru-cli.module.js'

describe('plugin-mineru-cli', () => {
  it('exports plugin metadata and a loadable module', () => {
    const logger = {
      log: jest.fn()
    }

    expect(plugin.meta.displayName).toBe('MinerU CLI')
    expect(plugin.meta.description).toContain('MINERU_TOKEN')
    expect(plugin.meta.description).toContain('managed secret file')
    expect(plugin.meta.description).not.toContain('placeholder')
    expect(plugin.register({ logger } as any)).toEqual({
      module: MinerUCliPluginModule,
      global: true
    })
    expect(logger.log).toHaveBeenCalledWith('register mineru cli plugin')
  })
})
