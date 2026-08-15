import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('OfficeCliPlugin bootstrap', () => {
  it('prewarms the runtime without blocking application startup', () => {
    const source = readFileSync(join(__dirname, 'office-cli.plugin.ts'), 'utf8')

    expect(source).toContain('onPluginBootstrap(): void')
    expect(source).toContain('void this.runtime.prewarm().catch')
    expect(source).not.toContain('await this.runtime.prewarm()')
  })
})
