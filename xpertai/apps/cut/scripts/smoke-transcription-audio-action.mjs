import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'cut-transcription-audio', 'bundle')
const workspace = await mkdtemp(path.join(os.tmpdir(), 'cut-transcription-audio-smoke-'))

try {
  const inputRoot = path.join(workspace, 'input')
  const outputRoot = path.join(workspace, 'output')
  await mkdir(path.join(inputRoot, 'media'), { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(inputRoot, 'media', 'tone.wav'), toneWav(2))
  const request = {
    contractVersion: '1',
    runtimeProfile: 'browser/playwright-1.61/v1',
    sandboxRuntimeVersion: '1.0.0',
    action: 'cut.prepare-transcription-audio',
    actionVersion: '1.0.0',
    payload: {
      sourcePath: '/media/tone.wav',
      sourceName: 'tone.wav',
      sourceMimeType: 'audio/wav',
      sampleRate: 16_000,
      channels: 1
    }
  }
  const requestPath = path.join(inputRoot, 'job.json')
  await writeFile(requestPath, JSON.stringify(request))
  const executable = await browserExecutable()
  const output = await execute(process.execPath, [path.join(actionRoot, 'runner.mjs'), '--request', requestPath, '--output', outputRoot], {
    CUT_SANDBOX_CHROMIUM_EXECUTABLE: executable
  }, 150_000)
  const wav = await readFile(path.join(outputRoot, 'speech.wav'))
  if (wav.length <= 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Audio proxy smoke output has an invalid WAVE header.')
  }
  if (wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16_000 || wav.readUInt16LE(34) !== 16) {
    throw new Error('Audio proxy smoke output is not 16 kHz mono PCM16.')
  }
  const progress = output.split('\n')
    .filter((line) => line.startsWith('XPERT_SANDBOX_PROGRESS '))
    .map((line) => JSON.parse(line.slice('XPERT_SANDBOX_PROGRESS '.length)))
  if (!progress.some((entry) => entry.progress === 1 && entry.current === 100 && entry.total === 100)) {
    throw new Error('Audio proxy Sandbox Action did not emit completed progress.')
  }
  process.stdout.write(`${JSON.stringify({ action: request.action, bytes: wav.length, sampleRate: 16_000, channels: 1, browser: executable })}\n`)
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
  throw new Error('No local Chromium executable is available for the audio proxy smoke test.')
}

function execute(command, args, environment, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Audio proxy Sandbox Action smoke exceeded ${timeoutMs}ms.`))
    }, timeoutMs)
    timer.unref()
    const append = (chunk) => { output = `${output}${String(chunk)}`.slice(-2 * 1024 * 1024) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve(output) : reject(new Error(output.trim() || `Audio proxy Sandbox Action smoke exited with code ${code}.`))
    })
  })
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
    buffer.writeInt16LE(Math.round(Math.sin(index / sampleRate * Math.PI * 2 * 440) * 12_000), 44 + index * 2)
  }
  return buffer
}
