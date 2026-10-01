#!/usr/bin/env node
import { readFile, writeFile, link, unlink, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWorkbook, editWorkbook, inspectWorkbook, recalculateWorkbook } from './index.mjs'
import { excelizeRuntime } from './author.mjs'
import { SUPPORTED_FUNCTIONS } from './schema.mjs'

async function writeNew(path, bytes) {
  const destination = resolve(path); await mkdir(dirname(destination), { recursive: true })
  const temporary = destination + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await link(temporary, destination) // Atomic, same-filesystem, never overwrite a user's existing result.
  } finally { await unlink(temporary).catch(() => {}) }
}
async function main() {
  const { positionals: [command, input, patch], values } = parseArgs({ allowPositionals: true, options: {
    output: { type: 'string' }, sheet: { type: 'string' }, range: { type: 'string' }, limit: { type: 'string' },
    version: { type: 'boolean' }
  } })
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  if (values.version) return { name: manifest.name, version: manifest.version }
  if (command === 'doctor') {
    await excelizeRuntime()
    const probe = await createWorkbook({ version: 1, sheets: [{ name: 'Check', rows: [[2, { formula: '=A1*3' }]] }] })
    if ((await inspectWorkbook(probe)).cells.find(c => c.cell === 'B1')?.value !== 6) throw new Error('Formula engine check failed')
    const render = spawnSync(process.env.XPERT_SPREADSHEETS_PYTHON || 'python3', [fileURLToPath(new URL('render.py', import.meta.url)), '--doctor'], { encoding: 'utf8' })
    if (render.status !== 0) throw new Error(render.stderr || 'Python renderer unavailable')
    return { status: 'ready', package: manifest.name, version: manifest.version, node: process.versions.node,
      excelize: '0.1.3', univer: '0.25.1', formulas: SUPPORTED_FUNCTIONS, render: JSON.parse(render.stdout) }
  }
  if (!input) throw new Error('Usage: xpert-artifact doctor|build spec.json|inspect input.xlsx|edit input.xlsx patch.json|recalculate input.xlsx|render input.xlsx [--output new-path]')
  if (command === 'render') {
    if (!values.output) throw new Error('A new --output directory is required')
    const result = spawnSync(process.env.XPERT_SPREADSHEETS_PYTHON || 'python3', [fileURLToPath(new URL('render.py', import.meta.url)), resolve(input), '--output', resolve(values.output)], { encoding: 'utf8', timeout: 230000, maxBuffer: 2 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Render failed')
    return JSON.parse(result.stdout)
  }
  const bytes = await readFile(input)
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Input exceeds 20 MiB')
  if (command === 'inspect' || command === 'validate') {
    const info = await inspectWorkbook(bytes, { sheet: values.sheet, range: values.range, limit: Number(values.limit ?? 120) })
    if (command === 'validate' && info.errors.length) throw new Error('Workbook contains cached formula errors: ' + JSON.stringify(info.errors))
    return info
  }
  if (!values.output || resolve(values.output) === resolve(input)) throw new Error('A NEW --output file is required')
  let output
  if (command === 'build') output = await createWorkbook(JSON.parse(bytes.toString()))
  else if (command === 'edit' && patch) output = await editWorkbook(bytes, JSON.parse(await readFile(patch, 'utf8')))
  else if (command === 'recalculate') output = await recalculateWorkbook(bytes)
  else throw new Error('Unknown command or missing patch file')
  await writeNew(values.output, output)
  return { output: values.output, ...await inspectWorkbook(output) }
}
main().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(JSON.stringify({ error: error.message })); process.exitCode = 1
})
