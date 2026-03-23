jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZipUnzipBootstrapService } from './zip-unzip-bootstrap.service.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

type EvalCase = {
  id: number
  prompt: string
  expected_output: string
}

describe('zip/unzip eval coverage', () => {
  const service = new ZipUnzipBootstrapService()
  const skill = readFileSync(join(moduleDir, 'skills/SKILL.md'), 'utf8')
  const workflows = readFileSync(join(moduleDir, 'skills/references/common-workflows.md'), 'utf8')
  const evals = JSON.parse(
    readFileSync(join(moduleDir, '../../evals/evals.json'), 'utf8')
  ) as { evals: EvalCase[] }
  const combined = [skill, workflows, service.buildSystemPrompt()].join('\n')

  const fragmentsById: Record<number, string[]> = {
    1: ['zip -r', '-x', 'node_modules', '.git', '*.log'],
    2: ['unzip -P', '-d /tmp/extracted'],
    3: ['zip -r -s 100m']
  }

  it.each(evals.evals)('covers eval case $id', (entry) => {
    const expectedFragments = fragmentsById[entry.id]

    expect(expectedFragments).toBeDefined()
    for (const fragment of expectedFragments) {
      expect(combined).toContain(fragment)
    }
  })
})
