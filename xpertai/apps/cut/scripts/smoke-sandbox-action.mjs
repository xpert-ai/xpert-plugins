import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'cut-render', 'bundle')
const workspace = await mkdtemp(path.join(os.tmpdir(), 'cut-render-smoke-'))
try {
  const inputRoot = path.join(workspace, 'input')
  const outputRoot = path.join(workspace, 'output')
  await mkdir(path.join(inputRoot, 'media'), { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(inputRoot, 'media', 'tone.wav'), toneWav(1.5))
  const request = {
    contractVersion: '1',
    runtimeProfile: 'browser/playwright-1.61/v1',
    sandboxRuntimeVersion: '1.0.0',
    action: 'cut.render-mp4',
    actionVersion: '1.1.5',
    payload: {
      sourceRevision: 7,
      timeoutMs: 120_000,
      exportSettings: { format: 'mp4', quality: 'high', includeAudio: true },
      document: {
        schemaVersion: 1,
        settings: { width: 320, height: 180, fps: 12, durationSeconds: 1.5, background: '#020617' },
        tracks: [
          {
            id: 'visual-main', name: 'Visual', kind: 'visual', muted: false, hidden: false,
            clips: [
              { id: 'color-1', type: 'color', name: 'Background', start: 0, duration: 1.5, trimIn: 0, trimOut: 0, color: '#0ea5e9' },
              { id: 'text-1', type: 'text', name: 'Headless Cut', start: 0, duration: 1.5, trimIn: 0, trimOut: 0, text: 'Headless Cut', color: '#ffffff', fontSize: 34 }
            ]
          },
          {
            id: 'audio-main', name: 'Audio', kind: 'audio', muted: false, hidden: false,
            clips: [{ id: 'audio-1', type: 'audio', name: 'Tone', start: 0, duration: 1.5, trimIn: 0, trimOut: 0, previewUrl: '/media/tone.wav', volume: 0.15 }]
          }
        ]
      }
    }
  }
  const requestPath = path.join(inputRoot, 'job.json')
  await writeFile(requestPath, JSON.stringify(request))
  const executable = await browserExecutable()
  const mp4Output = await execute(process.execPath, [path.join(actionRoot, 'runner.mjs'), '--request', requestPath, '--output', outputRoot], {
    CUT_SANDBOX_CHROMIUM_EXECUTABLE: executable
  }, 150_000)
  const mp4 = await readFile(path.join(outputRoot, 'cut.mp4'))
  const report = JSON.parse(await readFile(path.join(outputRoot, 'report.json'), 'utf8'))
  if (!mp4.includes(Buffer.from('ftyp')) || !mp4.includes(Buffer.from('moov'))) throw new Error('Smoke MP4 is structurally invalid.')
  if (!mp4.includes(Buffer.from('vide')) || !mp4.includes(Buffer.from('soun'))) throw new Error('Smoke MP4 must contain video and audio tracks.')
  if (report.sourceRevision !== 7 || report.frameCount !== 18 || report.progress !== 1) throw new Error('Smoke report does not match the deterministic input snapshot.')
  assertProgressLogs(mp4Output, 18)
  request.payload.exportSettings = { format: 'webm', quality: 'medium', includeAudio: false }
  await writeFile(requestPath, JSON.stringify(request))
  const webmOutput = await execute(process.execPath, [path.join(actionRoot, 'runner.mjs'), '--request', requestPath, '--output', outputRoot], {
    CUT_SANDBOX_CHROMIUM_EXECUTABLE: executable
  }, 150_000)
  const webm = await readFile(path.join(outputRoot, 'cut.webm'))
  const webmReport = JSON.parse(await readFile(path.join(outputRoot, 'report.json'), 'utf8'))
  if (!webm.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || !webm.includes(Buffer.from('webm'))) throw new Error('Smoke WebM is structurally invalid.')
  if (webmReport.format !== 'webm' || webmReport.quality !== 'medium' || webmReport.includeAudio !== false) throw new Error('Smoke WebM report does not preserve export settings.')
  assertProgressLogs(webmOutput, 18)
  process.stdout.write(`${JSON.stringify({ action: 'cut.render-mp4', mp4Bytes: mp4.length, webmBytes: webm.length, frameCount: report.frameCount, video: true, audio: true, browser: executable })}\n`)
} finally {
  await rm(workspace, { recursive: true, force: true })
}

async function browserExecutable() {
  const candidates = [
    process.env.CUT_SANDBOX_CHROMIUM_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true).catch(() => false)) return candidate
  }
  const { chromium } = await import('playwright')
  const candidate = chromium.executablePath()
  if (await access(candidate).then(() => true).catch(() => false)) return candidate
  throw new Error('No local Chromium executable is available for the Sandbox Action smoke test.')
}

function execute(command, args, environment, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Sandbox Action smoke exceeded ${timeoutMs}ms.`))
    }, timeoutMs)
    timer.unref()
    const append = (chunk) => { output = `${output}${String(chunk)}`.slice(-2 * 1024 * 1024) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve(output) : reject(new Error(output.trim() || `Sandbox Action smoke exited with code ${code}.`))
    })
  })
}

function assertProgressLogs(output, expectedFrameCount) {
  const platformEntries = output.split('\n')
    .filter((line) => line.startsWith('XPERT_SANDBOX_PROGRESS '))
    .map((line) => JSON.parse(line.slice('XPERT_SANDBOX_PROGRESS '.length)))
  if (!platformEntries.length || platformEntries.some((entry) => typeof entry.progress !== 'number')) {
    throw new Error('Sandbox Action did not emit structured XPERT_SANDBOX_PROGRESS logs.')
  }
  const completed = platformEntries.find((entry) => entry.progress === 1 && entry.current === expectedFrameCount && entry.total === expectedFrameCount)
  if (!completed) throw new Error('Sandbox Action did not emit a completed frame progress log.')
}

function toneWav(durationSeconds) {
  const sampleRate = 44_100
  const samples = Math.round(sampleRate * durationSeconds)
  const dataBytes = samples * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin(index / sampleRate * Math.PI * 2 * 440) * 12_000)
    buffer.writeInt16LE(value, 44 + index * 2)
  }
  return buffer
}
