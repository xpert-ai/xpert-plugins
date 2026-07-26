import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const checker = fileURLToPath(new URL('./check-plugin-entity-tables.mjs', import.meta.url))

function runFixture(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'plugin-entity-table-check-'))
  try {
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(directory, file)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, source)
    }
    spawnSync('git', ['init', '--quiet'], { cwd: directory })
    spawnSync('git', ['add', '.'], { cwd: directory })
    return spawnSync(process.execPath, [checker, '--all'], {
      cwd: directory,
      encoding: 'utf8'
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('accepts namespace-derived tables exported through a shared object', () => {
  const result = runFixture({
    'src/constants.ts': `
      import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
      export const ARTIFACT_NAMESPACE = 'sample_app' as const
      export const TABLES = {
        project: pluginArtifactTableName(ARTIFACT_NAMESPACE, 'project')
      } as const
    `,
    'src/project.entity.ts': `
      import { Entity } from 'typeorm'
      import { TABLES } from './constants.js'
      @Entity(TABLES.project)
      export class ProjectEntity {}
    `
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /check passed/)
})

test('accepts a direct imported constant built by the SDK helper', () => {
  const result = runFixture({
    'src/constants.ts': `
      import { pluginArtifactTableName as tableName } from '@xpert-ai/plugin-sdk'
      const ARTIFACT_NAMESPACE = 'sample_app' as const
      export const PROJECT_TABLE = tableName(ARTIFACT_NAMESPACE, 'project')
    `,
    'src/project.entity.ts': `
      import { Entity } from 'typeorm'
      import { PROJECT_TABLE } from './constants.js'
      @Entity(PROJECT_TABLE)
      export class ProjectEntity {}
    `
  })

  assert.equal(result.status, 0, result.stderr)
})

test('continues to reject unresolved or non-prefixed table expressions', () => {
  const unresolved = runFixture({
    'src/project.entity.ts': `
      import { Entity } from 'typeorm'
      const makeTableName = (value: string) => value
      @Entity(makeTableName('project'))
      export class ProjectEntity {}
    `
  })
  const nonPrefixed = runFixture({
    'src/project.entity.ts': `
      import { Entity } from 'typeorm'
      @Entity('project')
      export class ProjectEntity {}
    `
  })

  assert.equal(unresolved.status, 1)
  assert.match(unresolved.stderr, /unresolved @Entity/)
  assert.equal(nonPrefixed.status, 1)
  assert.match(nonPrefixed.stderr, /uses "project"/)
})
