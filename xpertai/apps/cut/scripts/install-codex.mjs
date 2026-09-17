import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { buildAgentPlugin, validateMcpUrl } from './build-agent-plugin.mjs'
import { resolveCodexExecutable } from './codex-cli.mjs'
import { verifyCutConnection } from './codex-mcp-check.mjs'

const execute = promisify(execFile)
const marketplaceName = 'xpert-cut-codex-local'
const selector = `xpert-cut-agent@${marketplaceName}`
const defaultDirectory = join(homedir(), '.local/share/xpert-cut-codex')

let codexExecutable

async function runCodex(args) {
  codexExecutable ??= await resolveCodexExecutable()
  try { await execute(codexExecutable, args, { timeout: 60000, maxBuffer: 2_000_000 }) }
  catch { throw new Error(`Codex command failed: codex ${args.join(' ')}. Check CLI availability and retry with --update if local files were already prepared.`) }
}

export async function readConnection(directory) {
  let saved
  const content = await readFile(join(directory, 'connection.json'), 'utf8')
  try { saved = JSON.parse(content) }
  catch { throw new Error('Local connection.json is not valid JSON.') }
  if (!saved || saved.owner !== 'xpert-cut-codex-installer-v1' || typeof saved.mcpUrl !== 'string' ||
      typeof saved.apiKey !== 'string' || typeof saved.allowLocalHttp !== 'boolean') {
    throw new Error('Installation is not managed by this installer.')
  }
  return saved
}

export async function installCodex({ directory = defaultDirectory, mcpUrl, apiKey, allowLocalHttp = false,
  update = false, verify = verifyCutConnection, run = runCodex }) {
  directory = resolve(directory)
  let exists = false
  try {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Installation path must be a regular directory.')
    exists = true
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (exists && !update) throw new Error('Installation exists. Use --update to preserve its connection.')
  if (!exists && update) throw new Error('No installation found. Run without --update first.')
  const connection = exists ? await readConnection(directory) : {
    owner: 'xpert-cut-codex-installer-v1', mcpUrl, apiKey: apiKey?.replace(/^Bearer\s+/i, '').trim(), allowLocalHttp
  }
  validateMcpUrl(connection.mcpUrl, connection.allowLocalHttp)
  if (!connection.apiKey || /[\r\n]/.test(connection.apiKey)) throw new Error('A non-empty, single-line MCP API key is required.')
  // Verify before touching the installation or registering anything with Codex.
  await verify(connection)
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 })
  const lock = await open(`${directory}.lock`, 'wx', 0o600)
  let staging
  try {
    staging = await mkdtemp(join(dirname(directory), '.cut-codex-install-'))
    await chmod(staging, 0o700)
    await mkdir(join(staging, 'plugins'), { mode: 0o700 })
    const plugin = await buildAgentPlugin({ output: join(staging, 'plugins/xpert-cut-agent'),
      mcpUrl: connection.mcpUrl, allowLocalHttp: connection.allowLocalHttp })
    const manifest = JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8'))
    manifest.version = `${manifest.version.split('+')[0]}+codex.${randomUUID()}`
    await writeFile(join(plugin, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    const mcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8'))
    mcp.mcpServers.cut.headers = { Authorization: `Bearer ${connection.apiKey}` }
    await writeFile(join(plugin, 'mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`)
    await chmod(join(plugin, 'mcp.json'), 0o600)
    await writeFile(join(staging, 'connection.json'), `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600 })
    await mkdir(join(staging, '.agents/plugins'), { recursive: true, mode: 0o700 })
    await writeFile(join(staging, '.agents/plugins/marketplace.json'), `${JSON.stringify({
      name: marketplaceName, interface: { displayName: 'Xpert Cut Local' }, plugins: [{
        name: 'xpert-cut-agent', source: { source: 'local', path: './plugins/xpert-cut-agent' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity'
      }]
    }, null, 2)}\n`)
    if (exists) {
      const backup = `${directory}.previous-${randomUUID()}`
      await rename(directory, backup)
      try { await rename(staging, directory) }
      catch (error) { await rename(backup, directory); throw error }
      staging = undefined
      await rm(backup, { recursive: true, force: true })
    } else {
      await rename(staging, directory)
      staging = undefined
    }
    // The managed source remains available for retry if Codex registration fails.
    await run(['plugin', 'marketplace', 'add', directory])
    await run(['plugin', 'add', selector])
    return { directory, selector }
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true })
    await lock.close()
    await rm(`${directory}.lock`, { force: true })
  }
}

async function askSecret() {
  if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal to enter the API key securely.')
  process.stdout.write('MCP API Key (hidden): ')
  emitKeypressEvents(process.stdin)
  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolveSecret, reject) => {
    let value = ''
    function finish(error) {
      process.stdin.removeListener('keypress', listener)
      process.stdin.setRawMode(Boolean(wasRaw))
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolveSecret(value)
    }
    function listener(text, key) {
      if (key?.ctrl && key.name === 'c') finish(new Error('Installation cancelled.'))
      else if (key?.name === 'return' || key?.name === 'enter') finish()
      else if (key?.name === 'backspace') value = Array.from(value).slice(0, -1).join('')
      else if (text && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text
    }
    process.stdin.on('keypress', listener)
  })
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      update: { type: 'boolean', default: false }, 'allow-local-http': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false }, 'codex-path': { type: 'string' }
    } })
    if (values.help) {
      process.stdout.write('Usage: node scripts/install-codex.mjs [--update] [--allow-local-http] [--codex-path /absolute/path/to/codex]\nRequires Node.js 20+ and Codex CLI with plugin support. First install prompts for endpoint and hidden API key.\n')
    } else {
      codexExecutable = await resolveCodexExecutable({ explicitPath: values['codex-path'] })
      process.stdout.write(`Using Codex CLI: ${codexExecutable}\n`)
      let mcpUrl, apiKey
      if (!values.update) {
        const input = createInterface({ input: process.stdin, output: process.stdout })
        try { mcpUrl = (await input.question('Xpert Cut MCP URL: ')).trim() }
        finally { input.close() }
        validateMcpUrl(mcpUrl, values['allow-local-http'])
        apiKey = await askSecret()
      }
      process.stdout.write('Checking MCP authentication and Cut tool discovery...\n')
      const result = await installCodex({ update: values.update, mcpUrl, apiKey, allowLocalHttp: values['allow-local-http'] })
      process.stdout.write(`Installed ${result.selector}\nLocal connection: ${join(result.directory, 'connection.json')}\nReload Codex and start a new task to use the plugin.\n`)
    }
  } catch (error) {
    // Do not print upstream response bodies, subprocess output or credential values.
    process.stderr.write(`${error instanceof Error ? error.message : 'Installation failed.'}\n`)
    process.exitCode = 1
  }
}
