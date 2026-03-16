import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export type PlaywrightSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' },
  { name: 'references/request-mocking.md', src: 'references/request-mocking.md' },
  { name: 'references/running-code.md', src: 'references/running-code.md' },
  { name: 'references/session-management.md', src: 'references/session-management.md' },
  { name: 'references/storage-state.md', src: 'references/storage-state.md' },
  { name: 'references/test-generation.md', src: 'references/test-generation.md' },
  { name: 'references/tracing.md', src: 'references/tracing.md' },
  { name: 'references/video-recording.md', src: 'references/video-recording.md' }
]

/**
 * Returns all playwright-cli skill files as assets ready to be uploaded
 * into the sandbox container.
 *
 * @param skillsDir - The target directory inside the sandbox where
 *   skill files will be written, e.g. `/workspace/.xpert/skills/playwright-cli`.
 */
export function getSkillAssets(skillsDir: string): PlaywrightSkillAsset[] {
  return SKILL_FILES.map(({ name, src }) => ({
    path: path.join(skillsDir, name),
    content: readSkill(src)
  }))
}
