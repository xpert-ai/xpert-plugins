import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const required = [
  'dist/index.js', 'dist/index.d.ts', 'dist/mcp-server.js', 'dist/mcp-server.d.ts', 'dist/xpert-cut-assistant.yaml',
  'dist/lib/remote-components/cut-workbench/app.js', 'dist/lib/remote-components/cut-workbench/app.css',
  'dist/sandbox-actions/cut-render/action.json', 'dist/sandbox-actions/cut-render/bundle/runner.mjs',
  'dist/sandbox-actions/cut-render/bundle/browser-entry.js',
  'dist/sandbox-actions/cut-transcription-audio/action.json', 'dist/sandbox-actions/cut-transcription-audio/bundle/runner.mjs',
  'dist/sandbox-actions/cut-transcription-audio/bundle/browser-entry.js',
  'dist/sandbox-actions/cut-transcription-whisper/action.json', 'dist/sandbox-actions/cut-transcription-whisper/bundle/runner.mjs',
  'dist/sandbox-actions/cut-transcription-whisper/bundle/browser-entry.js',
  'dist/sandbox-actions/cut-transcription-whisper/bundle/models/Xenova/whisper-tiny/onnx/encoder_model_q4.onnx',
  'dist/sandbox-actions/cut-transcription-whisper/bundle/models/Xenova/whisper-tiny/onnx/decoder_model_merged_q4.onnx',
  'dist/assets/upstream/LICENSE', 'dist/assets/upstream/ATTRIBUTION.md',
  '.xpertai-plugin/plugin.json', 'assets/logo.svg', 'assets/composerIcon.svg', 'skills/cut-agent-skill/SKILL.md',
  'docs/EDITOR-API-ROADMAP.md', 'docs/GATE-VERIFICATION.md', 'README.md'
]
const missing = required.filter((file) => !existsSync(join(root, file)))
if (missing.length) { console.error(`Cut plugin package output is missing: ${missing.join(', ')}`); process.exit(1) }
