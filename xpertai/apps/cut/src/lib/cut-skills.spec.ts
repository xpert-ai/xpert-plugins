import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CUT_SKILLS, readCutWorkflow } from './cut-skills.js'
import { cutTemplates } from './cut.templates.js'

describe('Cut packaged workflows', () => {
  it('binds every discoverable skill to the assistant', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../.xpertai-plugin/plugin.json', import.meta.url)), 'utf8'))
    const skills = manifest.targetAppMeta.xpert.marketplace.contents.filter((item: { type: string }) => item.type === 'skill')
    expect(skills.map((item: { name: string }) => item.name)).toEqual(CUT_SKILLS.map((skill) => skill.name))
    expect(cutTemplates[0].dependencies?.skills).toEqual(CUT_SKILLS.map((skill) => ({ componentKey: skill.name, targetAgentKey: 'Agent_Cut' })))
  })

  it.each(['cut-speech-editing', 'cut-captions', 'cut-verification', 'cut-export'] as const)(
    'loads base authorization rules and the packaged %s workflow', (name) => {
      const body = readCutWorkflow(name)
      expect(body).toContain('Reuse existing user approval')
      expect(body).toContain('Platform authorization')
      expect(body).toContain('baseRevision')
      expect(body).not.toContain('350 MiB')
      const skill = readFileSync(fileURLToPath(new URL(`../../skills/${name}/SKILL.md`, import.meta.url)), 'utf8')
      expect(body).toContain(skill.slice(skill.indexOf('\n---\n') + 5).trim())
    }
  )

  it('keeps unrelated export instructions out of a caption workflow', () => {
    expect(readCutWorkflow('cut-captions')).not.toContain('cut_start_headless_export')
    expect(readCutWorkflow('cut-export')).toContain('resultExportId')
  })
})
