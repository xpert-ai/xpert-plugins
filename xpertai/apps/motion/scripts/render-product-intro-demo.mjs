#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = requiredOutputDirectory()
const compositionPath = path.join(outputDir, 'xpert-ai-product-intro.html')
const requestPath = path.join(outputDir, 'render-request.json')
const finalVideoPath = path.join(outputDir, 'xpert-ai-product-intro.mp4')
const actionOutputPath = path.join(outputDir, 'motion.mp4')
const runnerPath = path.join(
  packageRoot,
  'dist',
  'sandbox-actions',
  'hyperframes-render',
  'bundle',
  'runner.mjs'
)

await access(runnerPath).catch(() => {
  throw new Error('Built HyperFrames Action is missing. Run the Motion build target first.')
})
await assertDoesNotExist(finalVideoPath)
await assertDoesNotExist(actionOutputPath)
await mkdir(outputDir, { recursive: true })

const {
  createProductIntroHyperframesComposition,
  XPERT_AI_PRODUCT_INTRO
} = await import(path.join(packageRoot, 'dist', 'lib', 'hyperframes-product-intro.js'))
const html = createProductIntroHyperframesComposition(XPERT_AI_PRODUCT_INTRO)
await writeFile(compositionPath, html)
await writeFile(
  requestPath,
  `${JSON.stringify({
    contractVersion: '1',
    action: 'motion.hyperframes-render',
    actionVersion: '1.0.0',
    payload: {
      compositionHtml: html,
      kind: 'mp4',
      quality: 'draft',
      fps: 24
    }
  }, null, 2)}\n`
)

await run(process.execPath, [runnerPath, '--request', requestPath, '--output', outputDir])
await rename(actionOutputPath, finalVideoPath)
process.stdout.write(`${JSON.stringify({
  compositionPath,
  videoPath: finalVideoPath,
  reportPath: path.join(outputDir, 'report.json')
})}\n`)

function requiredOutputDirectory() {
  const index = process.argv.indexOf('--output-dir')
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error('--output-dir must name a dedicated demo output directory.')
  const resolved = path.resolve(value)
  if (resolved === path.parse(resolved).root) throw new Error('--output-dir cannot be a filesystem root.')
  return resolved
}

async function assertDoesNotExist(target) {
  await access(target)
    .then(() => {
      throw new Error(`Refusing to overwrite existing demo output: ${target}`)
    })
    .catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Product intro render failed (${signal || code || 'unknown'}).`))
    })
  })
}
