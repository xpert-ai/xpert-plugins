import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const CUT_SKILLS = [
  {"type": "skill", "name": "cut-agent-skill", "displayName": "Cut Basics", "description": "Project identity, revision-safe edits and content authorization.", "tags": ["skill", "cut", "video"]},
  {"type": "skill", "name": "cut-speech-editing", "displayName": "Cut Speech Editing", "description": "Evidence-backed speech cleanup and rough cuts.", "tags": ["skill", "cut", "video"]},
  {"type": "skill", "name": "cut-captions", "displayName": "Cut Captions", "description": "Transcription, correction, translation and synchronized captions.", "tags": ["skill", "cut", "video"]},
  {"type": "skill", "name": "cut-verification", "displayName": "Cut Verification", "description": "Verify edits, caption alignment and produced media.", "tags": ["skill", "cut", "video"]},
  {"type": "skill", "name": "cut-export", "displayName": "Cut Export", "description": "Background render jobs and authenticated file delivery.", "tags": ["skill", "cut", "video"]},
] as const

export type CutSkillName = (typeof CUT_SKILLS)[number]['name']

// Source and dist modules have the same depth relative to the packaged skills.
export function readCutWorkflow(name: CutSkillName): string {
  const names: CutSkillName[] = name === 'cut-agent-skill' ? [name] : ['cut-agent-skill', name]
  const workflows = names.map((skill) => {
    const path = fileURLToPath(new URL(`../../skills/${skill}/SKILL.md`, import.meta.url))
    return readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
  })
  const entry = readFileSync(fileURLToPath(new URL('../../skills/cut-agent-skill/references/mcp.md', import.meta.url)), 'utf8')
  return [...workflows, entry.trim()].join('\n\n')
}
