jest.mock('./lib/lark-cli.module.js', () => ({
  LarkCliPluginModule: class LarkCliPluginModule {}
}))
jest.mock('./lib/lark-bootstrap.service.js', () => ({
  LarkBootstrapService: class LarkBootstrapService {}
}))
jest.mock('./lib/lark-connector.strategy.js', () => ({
  LarkConnectorStrategy: class LarkConnectorStrategy {}
}))
jest.mock('./lib/lark-connector-runtime.middleware.js', () => ({
  LarkConnectorRuntimeMiddleware: class LarkConnectorRuntimeMiddleware {}
}))
jest.mock('./lib/lark.middleware.js', () => ({
  LarkCLISkillMiddleware: class LarkCLISkillMiddleware {}
}))
jest.mock('./lib/lark.validator.js', () => ({
  LarkSkillValidator: class LarkSkillValidator {}
}))

import plugin from './index.js'
import { LarkCliPluginModule } from './lib/lark-cli.module.js'

describe('plugin-lark-cli', () => {
  it('exports plugin metadata and a loadable module', () => {
    const logger = {
      log: jest.fn()
    }

    expect(plugin.meta.displayName).toBe('Lark CLI')
    expect(plugin.meta.description).toContain('Lark CLI')
    expect(plugin.meta.description).toContain('sandbox')
    expect(plugin.meta.description).toContain('workspace connector')
    expect(plugin.meta.description).not.toContain('placeholder')
    expect(plugin.register({ logger } as any)).toEqual({
      module: LarkCliPluginModule,
      global: true
    })
    expect(logger.log).toHaveBeenCalledWith('register lark cli plugin')
  })

  it('has correct keywords', () => {
    expect(plugin.meta.keywords).toContain('lark')
    expect(plugin.meta.keywords).toContain('feishu')
    expect(plugin.meta.keywords).toContain('cli')
    expect(plugin.meta.keywords).toContain('middleware')
  })
})
