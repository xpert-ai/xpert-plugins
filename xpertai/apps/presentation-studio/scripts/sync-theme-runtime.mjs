import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const upstreamRoot = join(root, 'assets', 'upstream')
const metadata = JSON.parse(await readFile(join(upstreamRoot, 'UPSTREAM.json'), 'utf8'))
const repository = githubRepository(metadata.repository)
const commit = metadata.commit

if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error(`UPSTREAM.json must pin a full 40-character Git commit, received: ${commit}`)
}

const themeKeys = Array.from({ length: 12 }, (_, index) => `theme${String(index + 1).padStart(2, '0')}`)
const files = themeKeys.flatMap((themeKey) => [
  `${themeKey}.module.mjs`,
  `imported-theme-runtime.${themeKey}.js`
])
const vendorRelativeRoot = 'dashiai-ppt/project/dist/theme-runtime'
const upstreamRelativeRoot = 'skills/dashiai-ppt/project/dist/theme-runtime'
const outputRoot = join(upstreamRoot, vendorRelativeRoot)

await mkdir(outputRoot, { recursive: true })

const synced = []
for (let offset = 0; offset < files.length; offset += 4) {
  const batch = files.slice(offset, offset + 4)
  const results = await Promise.all(batch.map(syncFile))
  synced.push(...results.filter(Boolean))
}

if (synced.length) {
  console.log(`Synced and verified ${synced.length} DashiAI theme runtime files from ${repository}@${commit}.`)
} else {
  console.log(`Verified ${files.length} cached DashiAI theme runtime files for ${repository}@${commit}.`)
}

async function syncFile(fileName) {
  const relativePath = `${vendorRelativeRoot}/${fileName}`
  const expected = metadata.sha256?.[relativePath]
  if (!/^[0-9a-f]{64}$/.test(expected ?? '')) {
    throw new Error(`UPSTREAM.json is missing a SHA-256 checksum for ${relativePath}`)
  }

  const target = join(outputRoot, fileName)
  if (existsSync(target) && await sha256File(target) === expected) return null

  const url = `https://raw.githubusercontent.com/${repository}/${commit}/${upstreamRelativeRoot}/${fileName}`
  const temporary = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  try {
    await download(url, temporary)
    const actual = await sha256File(temporary)
    if (actual !== expected) {
      throw new Error(`Downloaded theme runtime checksum mismatch: ${fileName}`)
    }
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
  return fileName
}

async function download(url, output) {
  const arguments_ = [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--retry', '3',
    '--retry-delay', '1',
    '--retry-all-errors',
    '--connect-timeout', '15',
    '--max-time', '180',
    '--output', output,
    url
  ]
  await new Promise((resolve, reject) => {
    const child = spawn('curl', arguments_, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`curl failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}

function githubRepository(value) {
  const url = new URL(value)
  const segments = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || segments.length !== 2) {
    throw new Error(`UPSTREAM.json repository must be an HTTPS GitHub repository URL, received: ${value}`)
  }
  return segments.join('/')
}

async function sha256File(file) {
  return sha256(await readFile(file))
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}
