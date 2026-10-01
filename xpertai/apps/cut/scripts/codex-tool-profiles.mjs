import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const catalogue = JSON.parse(await readFile(new URL('../skills/cut-agent-skill/references/tool-profiles.json', import.meta.url), 'utf8'))

/** Static Codex allowlist export only; portable MCP has no per-round Profile protocol. */
export function codexToolProfileConfig({ profiles = [], plugin = 'xpert-cut-agent@xpert-cut-codex-local', pendingJobs = false } = {}) {
  if (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_-]+$/.test(plugin)) throw new Error('Use a plugin@marketplace identifier.')
  const known = new Set(catalogue.profiles.map((profile) => profile.id))
  for (const id of profiles) if (!known.has(id)) throw new Error(`Unknown Cut profile: ${id}`)
  const selected = new Set(['base', ...profiles, ...(pendingJobs ? ['task-control'] : [])])
  const tools = catalogue.profiles.filter((profile) => selected.has(profile.id)).flatMap((profile) => profile.tools)
  return [
    '# Static allowlist. Merge into the matching existing table; do not append a duplicate TOML table.',
    '# Reload the client after changing it. Include every stage needed by this task.',
    '# Resources remain separate. This does not implement automatic per-round filtering.',
    `[plugins.${JSON.stringify(plugin)}.mcp_servers.cut]`,
    `enabled_tools = ${JSON.stringify([...new Set(tools)])}`, ''
  ].join('\n')
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { profiles: { type: 'string' }, plugin: { type: 'string' },
      'pending-jobs': { type: 'boolean', default: false }, list: { type: 'boolean', default: false } } })
    if (values.list) process.stdout.write(catalogue.profiles.map((profile) => `${profile.id}: ${profile.tools.join(', ')}`).join('\n') + '\n')
    else process.stdout.write(codexToolProfileConfig({ profiles: values.profiles?.split(',').filter(Boolean),
      plugin: values.plugin, pendingJobs: values['pending-jobs'] }))
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
