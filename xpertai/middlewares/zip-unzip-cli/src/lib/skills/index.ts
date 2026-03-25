import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const SKILL_FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---/
const SKILL_DESCRIPTION_PATTERN = /^description:\s*(.+)$/m

export type ZipUnzipSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' },
  { name: 'references/common-workflows.md', src: 'references/common-workflows.md' }
]

export function getSkillAssets(skillsDir: string): ZipUnzipSkillAsset[] {
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
    throw new Error('Zip/Unzip skill description is missing from SKILL.md front matter.')
  }

  return description
}
