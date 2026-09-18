import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const file of [
  'dist/index.js',
  'dist/candidate-intake-assistant.yaml',
  'dist/lib/remote-components/candidate_intake__hr_workbench/app.js'
]) {
  await access(join(root, file))
}
console.log('Candidate Intake dist assets verified.')
