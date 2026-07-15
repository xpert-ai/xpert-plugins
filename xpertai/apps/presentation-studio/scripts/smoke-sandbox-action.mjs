import { spawn } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HARD_DEADLINE_MS = 360_000
const image = argument('--image')
const pageCount = numericArgument('--pages', 30)
if (!/@sha256:[a-f0-9]{64}$/i.test(image) && !process.argv.includes('--allow-local-image')) {
  throw new Error('--image must be an immutable Browser Runtime digest unless --allow-local-image is explicitly set.')
}
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'presentation-export')
const actionManifest = JSON.parse(await readFile(path.join(actionRoot, 'action.json'), 'utf8'))
const workspace = await mkdtemp(path.join(os.tmpdir(), 'presentation-action-smoke-'))
let activeContainer
try {
  await mkdir(path.join(workspace, 'input'), { recursive: true })
  await mkdir(path.join(workspace, 'output'), { recursive: true })
  await mkdir(path.join(workspace, 'runtime'), { recursive: true })
  await cp(path.join(actionRoot, 'bundle'), path.join(workspace, 'runtime', 'action'), { recursive: true, dereference: true })
  await writeFile(path.join(workspace, 'runtime', 'action-manifest.json'), JSON.stringify(actionManifest))
  await chmod(workspace, 0o777)
  await chmod(path.join(workspace, 'output'), 0o777)
  const results = []
  for (const kind of ['pdf', 'pptx']) {
    activeContainer = `xpert-presentation-action-smoke-${process.pid}-${kind}`
    await writeFile(path.join(workspace, 'input', 'job.json'), JSON.stringify({
      contractVersion: '1',
      runtimeProfile: 'browser/playwright-1.61/v1',
      sandboxRuntimeVersion: '1.0.0',
      action: 'presentation.export',
      actionVersion: '1.0.0',
      payload: { kind, title: `${pageCount}-page Sandbox ${kind.toUpperCase()}`, goal: smokeGoal(pageCount) }
    }))
    await execute('docker', [
      'run', '--rm', '--name', activeContainer, '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--memory=4g', '--cpus=2', '--shm-size=1g',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=4g',
      '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '-v', `${workspace}:/workspace:rw`,
      image,
      '--request', '/workspace/input/job.json',
      '--output', '/workspace/output',
      '--action-root', '/workspace/runtime/action',
      '--action-manifest', '/workspace/runtime/action-manifest.json'
    ], HARD_DEADLINE_MS, () => removeContainer(activeContainer))
    activeContainer = undefined
    const output = await readFile(path.join(workspace, 'output', `presentation.${kind}`))
    if (kind === 'pdf' && !output.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('PDF smoke output is invalid.')
    if (kind === 'pptx') {
      const zip = await JSZip.loadAsync(output)
      if (!zip.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) throw new Error('PPTX smoke output is invalid.')
    }
    results.push({ kind, bytes: output.length })
    await rm(path.join(workspace, 'output'), { recursive: true, force: true })
    await mkdir(path.join(workspace, 'output'), { recursive: true })
    await chmod(path.join(workspace, 'output'), 0o777)
  }
  process.stdout.write(`${JSON.stringify({ pageCount, outputs: results })}\n`)
} finally {
  if (activeContainer) await removeContainer(activeContainer)
  await rm(workspace, { recursive: true, force: true })
}

function smokeGoal(pageCount) {
  const layouts = [
    'theme02_page001',
    ...Array.from({ length: pageCount - 1 }, (_, index) => `theme02_page${String(index + 6).padStart(3, '0')}`)
  ]
  return {
    title: 'AI 产品组合策略 ✅',
    goal: '验证 30 页中英文与 Emoji 的隔离导出链路',
    themePack: 'theme02',
    pageCount,
    allowMediaReuse: false,
    text: {},
    preview: { autosave: false, themeSwitcher: false },
    slides: Array.from({ length: pageCount }, (_, index) => ({
      id: `smoke-slide-${index + 1}`,
      layout: layouts[index],
      props: {}
    }))
  }
}
function execute(command, args, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    let settled = false
    const timeout = timeoutMs ? setTimeout(() => {
      if (settled) return
      settled = true
      Promise.resolve(onTimeout?.()).finally(() => {
        child.kill('SIGKILL')
        reject(new Error(`${command} exceeded the ${timeoutMs}ms hard deadline.`))
      })
    }, timeoutMs) : undefined
    timeout?.unref()
    child.once('error', (error) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`))
    })
  })
}
function removeContainer(name) {
  if (!name) return Promise.resolve()
  return new Promise((resolve) => {
    const child = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' })
    child.once('error', () => resolve())
    child.once('exit', () => resolve())
  })
}
function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function numericArgument(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value < 1 || value > 30) throw new Error(`${name} must be an integer from 1 to 30.`)
  return value
}
