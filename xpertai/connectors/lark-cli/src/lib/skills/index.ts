import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LARK_CLI_SKILLS_DIR } from '../lark-cli.types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const SKILL_FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---/
const SKILL_DESCRIPTION_PATTERN = /^description:\s*(.+)$/m

export type LarkSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' }
]

export function getSkillAssets(): LarkSkillAsset[] {
  return SKILL_FILES.map(({ name, src }) => ({
    path: path.join(DEFAULT_LARK_CLI_SKILLS_DIR, name),
    content: readSkill(src)
  }))
}

export function getSkillDescription(): string {
  const skill = readSkill('SKILL.md')
  const frontMatter = skill.match(SKILL_FRONT_MATTER_PATTERN)?.[1] ?? ''
  const description = frontMatter.match(SKILL_DESCRIPTION_PATTERN)?.[1]?.trim()

  if (!description) {
    throw new Error('Lark skill description is missing from SKILL.md front matter.')
  }

  return description
}
