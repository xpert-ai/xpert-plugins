// The backend belongs to this Job only. stdin closure also stops it when the Action is killed.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import { fail } from './result.mjs'

export function normalizeOcrConfidenceThreshold(value = 0.5) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('INVALID_CONFIG')
  return value
}

export async function withOcrBackend(root, work, convert, ocrConfidenceThreshold = 0.5) {
  const threshold = normalizeOcrConfidenceThreshold(ocrConfidenceThreshold)
  const ready = path.join(work, 'ocr-ready.json')
  const child = spawn(
    path.join(root, 'python/bin/python3'),
    [
      '-I',
      '-X',
      'faulthandler',
      path.join(root, 'hybrid-backend.py'),
      '--root',
      root,
      '--ready',
      ready,
      '--ocr-confidence-threshold',
      String(threshold)
    ],
    {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: {
        ...process.env,
        TMPDIR: work,
        HOME: work,
        XDG_CACHE_HOME: path.join(work, 'cache'),
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_HUB_DISABLE_TELEMETRY: '1',
        DOCLING_ARTIFACTS_PATH: path.join(root, 'models'),
        PYTHONDONTWRITEBYTECODE: '1',
        OMP_NUM_THREADS: '2',
        MKL_NUM_THREADS: '2',
        OPENBLAS_NUM_THREADS: '2'
      }
    }
  )
  let spawnError,
    diagnostics = ''
  child.on('error', (error) => {
    spawnError = error
  })
  child.stderr.on('data', (bytes) => {
    diagnostics = (diagnostics + bytes.toString()).slice(-8192)
  })
  const exited = once(child, 'exit').catch(() => undefined)
  try {
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode) fail('RUNTIME_INVALID')
      let port
      try {
        port = JSON.parse(await readFile(ready, 'utf8')).port
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (Number.isSafeInteger(port) && port > 0 && port <= 65535) {
        const url = `http://127.0.0.1:${port}`
        const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) }).catch(() => undefined)
        if (health?.ok) return await convert(url)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    fail('RESOURCE_LIMIT')
  } catch (error) {
    process.stderr.write(`OpenDataLoader OCR backend exit: code=${child.exitCode}, signal=${child.signalCode}\n`)
    if (diagnostics) process.stderr.write(`OpenDataLoader OCR backend: ${diagnostics}\n`)
    if (child.signalCode === 'SIGKILL') fail('RESOURCE_LIMIT')
    throw error
  } finally {
    child.stdin.destroy()
    child.kill('SIGTERM')
    const kill = setTimeout(() => child.kill('SIGKILL'), 3000)
    kill.unref()
    if (!spawnError) await exited
    clearTimeout(kill)
  }
}
