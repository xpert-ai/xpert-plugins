import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

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
