import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))

/** Package only client assets. Never copy Runtime code or credentials. */
export async function buildAgentPlugin({ output, mcpUrl }) {
  let url
  try { url = new URL(mcpUrl) } catch { throw new Error('A valid Cut MCP HTTPS URL is required.') }
  if (url.protocol !== 'https:') throw new Error('The Cut MCP URL must use HTTPS.')
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The MCP URL must not contain credentials, query parameters or a fragment.')
  }
  if (!output || !isAbsolute(output) || basename(output) !== 'xpert-cut-agent') {
    throw new Error('Use an absolute output path ending in xpert-cut-agent.')
  }
  // Resolve the existing parent so a symlink cannot route output into the source.
  const parent = await realpath(dirname(output))
  const target = join(parent, basename(output))
  const source = await realpath(root)
  const distance = relative(source, target)
  if (!distance || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance))) {
    throw new Error('Output must be outside the Cut source directory.')
  }
  const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const mcp = JSON.parse(await readFile(join(root, 'mcp.json'), 'utf8'))
  manifest.version = pkg.version
  mcp.mcpServers = { cut: { type: 'streamable-http', url: url.href } }
  await mkdir(target) // EEXIST protects an existing installation or user output.
  try {
    await writeFile(join(target, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await writeFile(join(target, 'mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`)
    await copyTree(join(root, 'skills'), join(target, 'skills'))
    await mkdir(join(target, 'assets'))
    for (const file of ['logo.svg', 'composerIcon.svg']) {
      await copyFile(join(root, 'assets', file), join(target, 'assets', file))
    }
    await copyFile(join(root, 'docs/AGENT-PLUGIN.md'), join(target, 'README.md'))
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
  return target
}

async function copyTree(source, target) {
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) throw new Error('Shared skill assets must not be symlinks.')
  if (stat.isDirectory()) {
    await mkdir(target)
    for (const name of (await readdir(source)).sort()) await copyTree(join(source, name), join(target, name))
  } else if (stat.isFile()) await copyFile(source, target)
  else throw new Error('Shared skill assets must be regular files or directories.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { output: { type: 'string' }, 'mcp-url': { type: 'string' } } })
    const output = await buildAgentPlugin({ output: values.output, mcpUrl: values['mcp-url'] })
    process.stdout.write(`Built Xpert Cut Agent Plugin: ${output}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Agent plugin build failed.'}\n`)
    process.exitCode = 1
  }
}
