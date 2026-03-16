import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const PlaywrightPluginName = 'playwright-cli'
export const PlaywrightIcon = `data:image/png;base64,${readFileSync(join(moduleDir, 'icon.png')).toString('base64')}`
