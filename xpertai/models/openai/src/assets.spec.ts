import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('OpenAI packaged model assets', () => {
  it('removes stale YAML models during incremental packaging while preserving compiled code', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'openai-assets-'))
    try {
      for (const dir of ['scripts', 'src/llm', 'dist/llm', 'dist/retired']) {
        mkdirSync(path.join(root, dir), { recursive: true })
      }
      cpSync(path.resolve(__dirname, '../scripts/copy-assets.mjs'), path.join(root, 'scripts/copy-assets.mjs'))
      writeFileSync(path.join(root, 'src/llm/gpt-6-astra.yaml'), 'model: gpt-6-astra\n')
      writeFileSync(path.join(root, 'dist/llm/gpt-5.2-codex.yaml'), 'model: gpt-5.2-codex\n')
      writeFileSync(path.join(root, 'dist/retired/model.yml'), 'model: removed\n')
      writeFileSync(path.join(root, 'dist/llm/llm.js'), 'export const compiled = true\n')

      execFileSync(process.execPath, [path.join(root, 'scripts/copy-assets.mjs')])

      expect(existsSync(path.join(root, 'dist/llm/gpt-5.2-codex.yaml'))).toBe(false)
      expect(existsSync(path.join(root, 'dist/retired/model.yml'))).toBe(false)
      expect(readFileSync(path.join(root, 'dist/llm/gpt-6-astra.yaml'), 'utf8')).toBe('model: gpt-6-astra\n')
      expect(readFileSync(path.join(root, 'dist/llm/llm.js'), 'utf8')).toBe('export const compiled = true\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
