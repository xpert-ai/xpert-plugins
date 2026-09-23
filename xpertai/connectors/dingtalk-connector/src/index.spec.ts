import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('DingTalk connector plugin metadata', () => {
  it('uses a distinct connector package name', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
      name: string
      xpert?: { plugin?: { level?: string } }
    }

    expect(packageJson.name).toBe('@xpert-ai/plugin-dingtalk-connector')
    expect(packageJson.xpert?.plugin?.level).toBe('organization')
  })
})