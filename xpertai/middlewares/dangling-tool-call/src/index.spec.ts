jest.mock('./lib/dangling-tool-call.module.js', () => ({
  DanglingToolCallPluginModule: class DanglingToolCallPluginModule {}
}))

import plugin from './index.js'
import { DanglingToolCallPluginModule } from './lib/dangling-tool-call.module.js'

describe('plugin-dangling-tool-call', () => {
  it('exports plugin metadata and a loadable module', () => {
    const logger = {
      log: jest.fn()
    }

    expect(plugin.meta.displayName).toBe('Dangling Tool Call Middleware')
    expect(plugin.meta.description).toContain('dangling tool calls')
    expect(plugin.meta.description).toContain('ToolMessages')
    expect(plugin.register({ logger } as any)).toEqual({
      module: DanglingToolCallPluginModule,
      global: true
    })
    expect(logger.log).toHaveBeenCalledWith('register dangling tool call middleware plugin')
  })

  it('has the expected keywords', () => {
    expect(plugin.meta.keywords).toContain('middleware')
    expect(plugin.meta.keywords).toContain('tool call')
    expect(plugin.meta.keywords).toContain('history repair')
  })
})
