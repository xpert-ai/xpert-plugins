import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { posix as path } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export type MinerUSkillAsset = {
  path: string
  content: string
}

function readSkill(relativePath: string): string {
  return readFileSync(join(moduleDir, relativePath), 'utf8')
}

const SKILL_FILES = [
  { name: 'SKILL.md', src: 'SKILL.md' },
  { name: 'references/api_reference.md', src: 'references/api_reference.md' },
  { name: 'scripts/mineru_api.py', src: 'scripts/mineru_api.py' },
  { name: 'scripts/mineru_async.py', src: 'scripts/mineru_async.py' },
  { name: 'scripts/mineru_batch.py', src: 'scripts/mineru_batch.py' },
  { name: 'scripts/mineru_obsidian.py', src: 'scripts/mineru_obsidian.py' },
  { name: 'scripts/mineru_parallel.py', src: 'scripts/mineru_parallel.py' },
  { name: 'scripts/mineru_runner.py', src: 'scripts/mineru_runner.py' },
  { name: 'scripts/mineru_v2.py', src: 'scripts/mineru_v2.py' },
  { name: 'scripts/mineru_stable.py', src: 'scripts/mineru_stable.py' }
]

export function getSkillAssets(skillsDir: string): MinerUSkillAsset[] {
  return SKILL_FILES.map(({ name, src }) => ({
    path: path.join(skillsDir, name),
    content: readSkill(src)
  }))
}
