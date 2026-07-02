import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Module } from '@nestjs/common'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

function readPngAssetDataUrl(path: string) {
  return `data:image/png;base64,${readFileSync(join(moduleDir, path)).toString('base64')}`
}

const DOCUMENT_ICON = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/icon.png')
} as const

const DOCUMENT_LOGO = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/logo.png')
} as const

const DOCUMENT_BRAND_COLOR = '#2563EB'

const DOCUMENT_TRIAL_PROMPTS = [
  'Draft a project memo as a document',
  'Create a document from this outline',
  'Write a polished doc for this plan'
] as const

const DOCUMENT_TRIAL_CARD_BACKGROUND =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201200%20380%22%20preserveAspectRatio%3D%22none%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23dbeafe%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220.46%22%20stop-color%3D%22%23eef2ff%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e9d5ff%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22r%22%20cx%3D%220.25%22%20cy%3D%220.1%22%20r%3D%220.85%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.9%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url%28%23g%29%22%2F%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url%28%23r%29%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M90%20330C210%20210%20280%2080%20440%20115c125%2027%20145%20140%20275%20117%20122-21%20167-145%20312-127%2084%2011%20144%2058%20205%20125v150H90z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.25%22%2F%3E%0A%20%20%3Cg%20opacity%3D%220.28%22%20transform%3D%22translate%28770%2042%29%20rotate%288%29%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M0%200h145l55%2055v210H0z%22%20fill%3D%22%23fff%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M145%200v55h55%22%20fill%3D%22%23bfdbfe%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%2234%22%20y%3D%2294%22%20width%3D%22118%22%20height%3D%2214%22%20rx%3D%227%22%20fill%3D%22%232563eb%22%20opacity%3D%220.65%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%2234%22%20y%3D%22130%22%20width%3D%22142%22%20height%3D%2214%22%20rx%3D%227%22%20fill%3D%22%232563eb%22%20opacity%3D%220.36%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%2234%22%20y%3D%22166%22%20width%3D%2296%22%20height%3D%2214%22%20rx%3D%227%22%20fill%3D%22%232563eb%22%20opacity%3D%220.36%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E'

const DOCUMENT_TRIAL_SHORTCUTS = DOCUMENT_TRIAL_PROMPTS.map((prompt, index) => ({
  id: `documents-${index + 1}`,
  prompt,
  skillKey: 'documents',
  icon: DOCUMENT_ICON
}))

@Module({})
export class DocumentsSkillPlugin {}

const runtimeRequirements = {
  requiredTools: [
    {
      kind: 'agent-middleware-tool',
      provider: 'SkillsMiddleware',
      name: 'read_skill_file',
      required: true,
      purpose: 'Read bundled skill instructions, references, scripts, and assets before use.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SkillsMiddleware',
      name: 'skill_shell',
      required: true,
      purpose: 'Run shell commands from the installed skill runtime directory for DOCX creation and verification.'
    }
  ],
  compatibleTools: [
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxShell',
      name: 'sandbox_shell',
      required: false,
      purpose: 'Alternative general shell execution tool when skill_shell is unavailable.'
    },
    {
      kind: 'builtin-toolset-tool',
      provider: 'bash',
      name: 'bash_execute',
      required: false,
      purpose: 'Alternative Bash execution tool for Xpert templates that bind builtin toolsets.'
    },
    {
      kind: 'builtin-toolset-tool',
      provider: 'file',
      name: 'file_edit',
      required: false,
      purpose: 'Optional workspace file inspection and edits for generated artifact support files.'
    },
    {
      kind: 'builtin-toolset-tool',
      provider: 'python',
      name: 'python_execute',
      required: false,
      purpose: 'Optional Python execution helper when shell access is delegated to the Python toolset.'
    }
  ],
  requiredRuntime: {
    filesystem: {
      read: true,
      write: true,
      workspace: true
    },
    shell: true,
    workspaceDependencies: true,
    executables: ['python', 'node'],
    packages: ['python-docx', 'Pillow']
  },
  optionalRuntime: {
    executables: ['soffice', 'pdfinfo', 'pdftoppm'],
    packages: ['pdf2image', 'reportlab'],
    integrations: ['Google Drive document import for native Google Docs output']
  }
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['skill', 'xpertai-bundle'],
        capabilities: ['documents', 'documents-skill'],
        runtime: runtimeRequirements,
        // Compatibility: plugin-sdk 3.10.1 does not type trialShortcuts yet.
        marketplace: {
          screenshots: [DOCUMENT_TRIAL_CARD_BACKGROUND],
          trialShortcuts: DOCUMENT_TRIAL_SHORTCUTS,
          contents: [
            {
              type: 'skill',
              name: 'documents',
              displayName: 'Documents',
              icon: DOCUMENT_ICON,
              color: DOCUMENT_BRAND_COLOR,
              description:
                'Create, edit, redline, comment on, render, and verify DOCX or Google Docs-targeted document artifacts.',
              tags: ['skill', 'documents', 'docx', 'word']
            }
          ]
        } as any
      }
    },
    category: 'tools',
    displayName: 'Documents',
    description:
      'Skill-only Xpert plugin for document artifact workflows converted from Codex primary-runtime Documents 26.630.12135.',
    icon: DOCUMENT_LOGO,
    keywords: ['documents', 'docx', 'word', 'google-docs', 'skill'],
    author: 'XpertAI'
  },
  register() {
    return { module: DocumentsSkillPlugin, global: true }
  }
}

export default plugin
