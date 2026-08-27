import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

describe('Cut plugin metadata', () => {
  it('keeps the static manifest and runtime Xpert classifications aligned', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(join(__dirname, '..', '.xpertai-plugin', 'plugin.json'), 'utf8')
    )
    const manifestTypes = readStringArray(
      readProperty(readProperty(manifest, 'targetAppMeta'), 'xpert'),
      'types'
    )
    const runtimeTypes = readRuntimeTypes()

    expect(runtimeTypes).toEqual(manifestTypes)
    expect(runtimeTypes).toContain('mcp')
    expect(runtimeTypes).not.toContain('tool')
  })
})

function readRuntimeTypes(): string[] | undefined {
  const entrypointUrl = pathToFileURL(join(__dirname, 'index.ts')).href
  const output = execFileSync(
    process.execPath,
    [
      '--loader',
      'ts-node/esm',
      '--input-type=module',
      '-e',
      `const { default: plugin } = await import(${JSON.stringify(entrypointUrl)}); process.stdout.write(JSON.stringify(plugin.meta.targetAppMeta?.xpert?.types))`
    ],
    {
      cwd: join(__dirname, '../../..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        TS_NODE_PROJECT: join(__dirname, '..', 'tsconfig.spec.json'),
        TS_NODE_TRANSPILE_ONLY: 'true'
      }
    }
  )

  return readStringList(JSON.parse(output))
}

function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function readStringArray(value: unknown, key: string): string[] | undefined {
  return readStringList(readProperty(value, key))
}

function readStringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}
