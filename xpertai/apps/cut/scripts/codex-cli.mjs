import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export async function resolveCodexExecutable({ explicitPath, platform = process.platform,
  userHome = homedir(), probe = execute } = {}) {
  const candidates = explicitPath ? [explicitPath] : ['codex', ...(platform === 'darwin' ? [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    join(userHome, 'Applications/Codex.app/Contents/Resources/codex'),
    join(userHome, 'Applications/ChatGPT.app/Contents/Resources/codex')
  ] : [])]
  let foundExecutable = false
  for (const candidate of candidates) {
    try {
      await probe(candidate, ['plugin', 'add', '--help'], { timeout: 15000, maxBuffer: 2_000_000 })
      return candidate
    } catch (error) {
      if (error.code !== 'ENOENT') foundExecutable = true
    }
  }
  throw new Error(foundExecutable
    ? 'Codex was found, but its plugin command could not run. Use --codex-path /absolute/path/to/a/plugin-capable/codex.'
    : 'Codex CLI was not found in PATH or the desktop application. Install Codex or use --codex-path /absolute/path/to/codex.')
}
