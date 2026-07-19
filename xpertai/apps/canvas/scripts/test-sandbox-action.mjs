import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(path.join(tmpdir(), 'canvas-action-test-'))
try {
  const inputRoot = path.join(root, 'input')
  const outputRoot = path.join(root, 'output')
  await mkdir(path.join(inputRoot, 'canvas'), { recursive: true })
  await writeFile(path.join(inputRoot, 'job.json'), JSON.stringify({
    contractVersion: '1',
    action: 'canvas.export',
    actionVersion: '1.0.0',
    payload: { title: 'Empty Canvas', description: null, revision: 1, pageId: 'page:page', pageName: 'Page 1', emptyLabel: 'Empty page' }
  }))
  await writeFile(path.join(inputRoot, 'canvas', 'snapshot.json'), JSON.stringify({
    schema: {},
    store: { 'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} } }
  }))
  await execFileAsync(process.execPath, [
    path.join(packageRoot, 'dist', 'sandbox-actions', 'canvas-export', 'bundle', 'runner.mjs'),
    '--request', path.join(inputRoot, 'job.json'),
    '--output', outputRoot,
    '--action-root', path.join(packageRoot, 'dist', 'sandbox-actions', 'canvas-export'),
    '--action-manifest', path.join(packageRoot, 'dist', 'sandbox-actions', 'canvas-export', 'action.json')
  ])
  const svg = await readFile(path.join(outputRoot, 'canvas.svg'), 'utf8')
  if (!svg.includes('<svg') || !svg.includes('Empty page') || !svg.endsWith('</svg>')) {
    throw new Error('Canvas Sandbox Action empty-page smoke test failed.')
  }
  process.stdout.write(`${JSON.stringify({ smokeTest: 'canvas.export', outputBytes: Buffer.byteLength(svg) })}\n`)
} finally {
  await rm(root, { recursive: true, force: true })
}
