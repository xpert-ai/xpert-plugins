#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const actionRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(actionRoot, 'project')
const runtimeModulesRoot = path.join(actionRoot, 'runtime-modules')

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = argument('--request')
  const outputDir = argument('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  await mkdir(outputDir, { recursive: true })
  const workRoot = await mkdtemp(path.join(outputDir, '.presentation-action-'))
  try {
    const deckDir = path.join(workRoot, 'deck')
    const pptDir = path.join(deckDir, 'ppt')
    await mkdir(pptDir, { recursive: true })
    await cp(path.join(path.dirname(requestPath), 'assets'), path.join(pptDir, 'assets'), {
      recursive: true,
      force: true
    }).catch((error) => {
      if (!isMissing(error)) throw error
    })
    const goalPath = path.join(deckDir, 'goal.json')
    const indexPath = path.join(pptDir, 'index.html')
    await writeFile(goalPath, `${JSON.stringify(request.payload.goal, null, 2)}\n`)
    await execute(process.execPath, [path.join(projectRoot, 'scripts/render-goal-deck.action.mjs'), goalPath, indexPath], workRoot)
    const outputPath = path.join(outputDir, `presentation.${request.payload.kind}`)
    const reportPath = path.join(outputDir, 'report.json')
    const args = [
      path.join(projectRoot, 'scripts/export-pptx.action.mjs'),
      pptDir,
      outputPath,
      '--title',
      request.payload.title,
      '--report',
      reportPath
    ]
    if (request.payload.kind === 'pdf') args.push('--pdf')
    await execute(process.execPath, args, workRoot, {
      INIT_CWD: workRoot,
      DASHI_PPT_THEME_RUNTIME: 'prebuilt',
      DASHI_PPT_CERT_DIR: path.join(workRoot, '.https-preview'),
      HOME: path.join(workRoot, '.home')
    })
    await validateOutput(outputPath, request.payload.kind)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

function parseRequest(value) {
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'presentation.export' || value.actionVersion !== '1.0.0') {
    throw new Error('EXPORT_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  if (!isObject(value.payload) || (value.payload.kind !== 'pdf' && value.payload.kind !== 'pptx')) {
    throw new Error('EXPORT_INPUT_INVALID: payload kind must be pdf or pptx.')
  }
  if (typeof value.payload.title !== 'string' || !value.payload.title.trim() || !isObject(value.payload.goal)) {
    throw new Error('EXPORT_INPUT_INVALID: payload requires title and goal.')
  }
  return value
}

async function validateOutput(outputPath, kind) {
  const buffer = await readFile(outputPath)
  if (!buffer.length) throw new Error('EXPORT_OUTPUT_INVALID: output is empty.')
  if (kind === 'pdf') {
    const { PDFDocument } = await import('pdf-lib')
    const document = buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
      ? await PDFDocument.load(buffer).catch(() => null)
      : null
    if (!document?.getPageCount()) throw new Error('EXPORT_OUTPUT_INVALID: PDF structure is invalid.')
    return
  }
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer).catch(() => null)
  if (!zip?.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) {
    throw new Error('EXPORT_OUTPUT_INVALID: PPTX structure is invalid.')
  }
  if (!Object.keys(zip.files).some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))) {
    throw new Error('EXPORT_OUTPUT_INVALID: PPTX contains no slides.')
  }
}

function execute(command, args, cwd, additionalEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...additionalEnvironment,
        // Dependencies required through createRequire() must remain part of
        // the immutable Action Bundle without using npm's reserved
        // node_modules directory, which is removed from packed plugins.
        NODE_PATH: [runtimeModulesRoot, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output = appendOutput(output, chunk) })
    child.stderr.on('data', (chunk) => { output = appendOutput(output, chunk) })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(output.trim() || `Action subprocess exited with code ${code ?? 'null'} signal ${signal ?? 'none'}.`))
    })
  })
}

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`EXPORT_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}
function appendOutput(current, chunk) {
  const next = `${current}${String(chunk)}`
  return next.length > 4 * 1024 * 1024 ? next.slice(-4 * 1024 * 1024) : next
}
function classify(message) {
  const normalized = message.toUpperCase()
  if (normalized.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (normalized.includes('EXPORT_INPUT_INVALID') || normalized.includes('GOAL SPEC VALIDATION FAILED')) return 'EXPORT_INPUT_INVALID'
  if (normalized.includes('BROWSER') || normalized.includes('CHROMIUM') || normalized.includes('PLAYWRIGHT')) return 'BROWSER_LAUNCH_FAILED'
  if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isMissing(error) { return error instanceof Error && 'code' in error && error.code === 'ENOENT' }
