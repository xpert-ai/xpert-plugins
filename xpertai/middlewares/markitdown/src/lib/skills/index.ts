import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export type MarkItDownSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' },
  { name: 'references/supported-formats.md', src: 'references/supported-formats.md' }
]

/**
 * Returns all markitdown skill files as assets ready to be uploaded
 * into the sandbox container.
 *
 * @param skillsDir - The target directory inside the sandbox where
 *   skill files will be written, e.g. `/workspace/.xpert/skills/markitdown`.
 */
export function getSkillAssets(skillsDir: string): MarkItDownSkillAsset[] {
  return SKILL_FILES.map(({ name, src }) => ({
    path: path.join(skillsDir, name),
    content: readSkill(src)
  }))
}
