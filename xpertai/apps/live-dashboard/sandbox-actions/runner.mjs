import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { validateDocument } from './validate.mjs'

const argument = key => { const i = process.argv.indexOf(key); if (i < 0 || !process.argv[i + 1]) throw new Error('Missing runtime argument'); return process.argv[i + 1] }
const requestPath = argument('--request'), output = argument('--output')
const input = JSON.parse(await readFile(join(dirname(requestPath), 'document.json'), 'utf8'))
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
try {
  const report = await validateDocument(input, browser, join(dirname(fileURLToPath(import.meta.url)), 'host.js'))
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'report.json'), JSON.stringify(report))
} finally { await browser.close() }
