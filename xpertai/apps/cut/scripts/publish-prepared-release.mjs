import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computePackState, withoutNodeDebugger } from './release-package-state.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseRoot = join(packageRoot, '.release')
const manifestPath = join(releaseRoot, 'release-manifest.json')
const releaseArgs = process.argv.slice(2).filter((arg) => arg !== '--')
const dryRun = releaseArgs.includes('--dry-run')
const unsupportedArgs = releaseArgs.filter((arg) => arg !== '--dry-run')

if (unsupportedArgs.length > 0) {
  throw new Error(`Unsupported release publish argument(s): ${unsupportedArgs.join(', ')}`)
}

const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
validateManifest(manifest, packageJson)

const tarballPath = resolve(releaseRoot, manifest.tarball)
if (!tarballPath.startsWith(`${resolve(releaseRoot)}${sep}`)) {
  throw new Error('Prepared tarball path escapes the Cut release directory.')
}

const tarballBytes = await readFile(tarballPath)
const tarballStat = await stat(tarballPath)
const actualSha256 = createHash('sha256').update(tarballBytes).digest('hex')
if (tarballStat.size !== manifest.size || actualSha256 !== manifest.sha256) {
  throw new Error('Prepared tarball has changed since release:prepare. Run release:prepare again.')
}
const packState = await computePackState(packageRoot)
if (packState.fileCount !== manifest.sourceFileCount || packState.treeSha256 !== manifest.sourceTreeSha256) {
  throw new Error('Cut package files changed after release:prepare. Run release:prepare again.')
}

const registry = process.env.NPM_CONFIG_REGISTRY || process.env.npm_config_registry || 'https://registry.npmjs.org/'
const args = [
  'publish',
  tarballPath,
  '--json',
  `--registry=${registry}`,
  '--tag=latest',
  '--access=public'
]

let otp = ''
if (dryRun) {
  args.push('--dry-run')
} else {
  otp = readConfiguredOtp() || await readHiddenOtp()
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('npm OTP must contain exactly six digits.')
  }
}

process.stdout.write(
  `${dryRun ? 'Validating' : 'Publishing'} ${manifest.packageName}@${manifest.packageVersion} ` +
  `from prepared tarball (${manifest.size} bytes).\n`
)

const publishEnv = withoutNodeDebugger(process.env)
if (otp) publishEnv.NPM_CONFIG_OTP = otp
const publishResult = spawnSync('npm', args, {
  cwd: packageRoot,
  env: publishEnv,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 32 * 1024 * 1024
})
otp = ''
delete publishEnv.NPM_CONFIG_OTP

if (publishResult.status !== 0) {
  if (publishResult.stdout) process.stdout.write(publishResult.stdout)
  if (publishResult.stderr) process.stderr.write(publishResult.stderr)
  throw new Error(`npm publish failed with exit code ${publishResult.status ?? 'unknown'}.`)
}

process.stdout.write(
  dryRun
    ? 'Prepared Cut tarball passed npm publish dry-run validation.\n'
    : `Published ${manifest.packageName}@${manifest.packageVersion}.\n`
)

function validateManifest(manifest, packageJson) {
  if (
    manifest?.schemaVersion !== 1 ||
    typeof manifest.packageName !== 'string' ||
    typeof manifest.packageVersion !== 'string' ||
    typeof manifest.tarball !== 'string' ||
    !manifest.tarball.endsWith('.tgz') ||
    !Number.isSafeInteger(manifest.size) ||
    manifest.size <= 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !Number.isSafeInteger(manifest.sourceFileCount) ||
    manifest.sourceFileCount <= 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceTreeSha256)
  ) {
    throw new Error('Cut release manifest is invalid. Run release:prepare again.')
  }
  if (manifest.packageName !== packageJson.name || manifest.packageVersion !== packageJson.version) {
    throw new Error('Cut package name or version changed after release:prepare. Run release:prepare again.')
  }
}

function readConfiguredOtp() {
  return (process.env.NPM_CONFIG_OTP || process.env.npm_config_otp || '').trim()
}

async function readHiddenOtp() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('A fresh npm OTP is required. Run this command in a TTY or set NPM_CONFIG_OTP for this process.')
  }

  process.stdout.write('Fresh npm OTP: ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return await new Promise((resolveOtp, rejectOtp) => {
    let value = ''
    const finish = (error) => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) rejectOtp(error)
      else resolveOtp(value)
    }
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('npm publish cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          return
        }
        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        if (/\d/.test(character) && value.length < 6) {
          value += character
          process.stdout.write('*')
        }
      }
    }
    process.stdin.on('data', onData)
  })
}
