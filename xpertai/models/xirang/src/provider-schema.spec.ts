import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = dirname(fileURLToPath(import.meta.url))

describe('Xirang provider assets', () => {
  it('declares a large icon for both supported UI locales', () => {
    const provider = parse(readFileSync(join(root, 'xirang.yaml'), 'utf8')) as {
      icon_large?: { en_US?: string; zh_Hans?: string }
    }

    expect(provider.icon_large).toEqual({ en_US: 'icon.svg', zh_Hans: 'icon.svg' })
    if (!provider.icon_large?.en_US || !provider.icon_large.zh_Hans) {
      throw new Error('Xirang provider large icon is not configured for both locales')
    }
    expect(existsSync(join(root, '_assets', provider.icon_large.en_US))).toBe(true)
    expect(existsSync(join(root, '_assets', provider.icon_large.zh_Hans))).toBe(true)
  })
})
