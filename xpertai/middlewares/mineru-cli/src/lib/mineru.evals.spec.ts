jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

describe('mineru eval coverage', () => {
  const service = new MinerUBootstrapService()
  const skill = readFileSync(join(moduleDir, 'skills/SKILL.md'), 'utf8')
  const combined = [skill, service.buildSystemPrompt()].join('\n')

  it('covers local file and url flows', () => {
    expect(combined).toContain('--file /path/to/document.pdf')
    expect(combined).toContain('--url "https://example.com/paper.pdf"')
  })

  it('covers token fallback guidance', () => {
    expect(combined).toContain('MINERU_TOKEN')
    expect(combined).toContain('securely provisioned')
    expect(combined).toContain('lightweight API')
  })

  it('covers recommended model and output directory guidance', () => {
    expect(combined).toContain('--model vlm')
    expect(combined).toContain('mineru_report/')
    expect(combined).toContain('mineru_{task_id}/')
    expect(combined).toContain('_2')
  })
})
