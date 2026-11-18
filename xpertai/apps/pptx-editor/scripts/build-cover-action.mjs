import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, lstat, rm } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const action = new URL('dist/sandbox-actions/pptx-cover/', root)
const bundle = new URL('bundle/', action)
const runner = await readFile(new URL('sandbox-actions/cover/runner.mjs', root))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = JSON.stringify({ name: 'pptx.cover', version: '1.0.0', runtimeProfile: 'browser/playwright-1.61/v1',
  runtimeContractVersion: '1', playwrightVersion: '1.61.0', bundle: './bundle', entrypoint: 'runner.mjs',
  bundleSha256: sha(`runner.mjs\0${runner.length}\0${sha(runner)}\n`) }, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if ((await readdir(bundle)).join() !== 'runner.mjs' || !(await lstat(new URL('runner.mjs', bundle))).isFile())
    throw new Error('Unexpected PPTX cover Action content')
  if (!(await readFile(new URL('runner.mjs', bundle))).equals(runner)
    || await readFile(new URL('action.json', action), 'utf8') !== manifest) throw new Error('Stale PPTX cover Action')
} else {
  await rm(bundle, { recursive: true, force: true })
  await mkdir(bundle, { recursive: true })
  await writeFile(new URL('runner.mjs', bundle), runner)
  await writeFile(new URL('action.json', action), manifest)
}
