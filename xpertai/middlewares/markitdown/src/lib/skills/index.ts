import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const SKILL_FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---/
const SKILL_DESCRIPTION_PATTERN = /^description:\s*(.+)$/m

export type MarkItDownSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' }
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

export function getSkillDescription(): string {
  const skill = readSkill('SKILL.md')
  const frontMatter = skill.match(SKILL_FRONT_MATTER_PATTERN)?.[1] ?? ''
  const description = frontMatter.match(SKILL_DESCRIPTION_PATTERN)?.[1]?.trim()

  if (!description) {
    throw new Error('MarkItDown skill description is missing from SKILL.md front matter.')
  }

  return description
}
