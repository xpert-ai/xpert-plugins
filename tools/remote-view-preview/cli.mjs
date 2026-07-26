#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startRemoteViewPreview } from './preview-host.mjs'

const configFlag = process.argv.indexOf('--config')
if (configFlag < 0 || !process.argv[configFlag + 1]) {
  throw new Error('Usage: node tools/remote-view-preview/cli.mjs --config <preview.config.mjs> [--port 4417]')
}
const portFlag = process.argv.indexOf('--port')
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 4417
const configModule = await import(pathToFileURL(resolve(process.argv[configFlag + 1])).href)
const preview = await startRemoteViewPreview(configModule.default, { port })
console.log(`Remote View Preview: ${preview.url}`)
