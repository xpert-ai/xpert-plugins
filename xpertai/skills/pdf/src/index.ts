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

const PDF_ICON = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/icon.png')
} as const

const PDF_LOGO = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/logo.png')
} as const

const PDF_BRAND_COLOR = '#DC2626'

const PDF_TRIAL_PROMPTS = [
  'Review this PDF and verify its layout',
  'Create a polished PDF from this content',
  'Extract tables and text from this PDF'
] as const

const PDF_TRIAL_CARD_BACKGROUND =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201200%20380%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fee2e2%22%2F%3E%3Cstop%20offset%3D%220.5%22%20stop-color%3D%22%23fff1f2%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fecaca%22%2F%3E%3C%2FlinearGradient%3E%3CradialGradient%20id%3D%22r%22%20cx%3D%220.22%22%20cy%3D%220.08%22%20r%3D%220.9%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.92%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23g)%22%2F%3E%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23r)%22%2F%3E%3Cpath%20d%3D%22M78%20318C214%20235%20288%2096%20452%20128c128%2025%20152%20143%20286%20106%20134-38%20180-150%20328-94%2060%2023%20103%2062%20155%20118v122H78z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.24%22%2F%3E%3Cg%20opacity%3D%220.3%22%20transform%3D%22translate(790%2052)%20rotate(7)%22%3E%3Cpath%20d%3D%22M0%200h150l58%2058v226H0z%22%20fill%3D%22%23ffffff%22%2F%3E%3Cpath%20d%3D%22M150%200v58h58%22%20fill%3D%22%23fecaca%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2292%22%20width%3D%22122%22%20height%3D%2215%22%20rx%3D%227.5%22%20fill%3D%22%23DC2626%22%20opacity%3D%220.66%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%22130%22%20width%3D%22146%22%20height%3D%2215%22%20rx%3D%227.5%22%20fill%3D%22%23DC2626%22%20opacity%3D%220.38%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%22168%22%20width%3D%2298%22%20height%3D%2215%22%20rx%3D%227.5%22%20fill%3D%22%23DC2626%22%20opacity%3D%220.38%22%2F%3E%3Ctext%20x%3D%2231%22%20y%3D%22238%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2244%22%20font-weight%3D%22700%22%20fill%3D%22%23DC2626%22%20opacity%3D%220.7%22%3EPDF%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fsvg%3E'

const PDF_TRIAL_SHORTCUTS = PDF_TRIAL_PROMPTS.map((prompt, index) => ({
  id: `pdf-${index + 1}`,
  prompt,
  skillKey: 'pdf',
  icon: PDF_ICON
}))

const PDF_MARKETPLACE_CONTENT = {
  type: 'skill' as const,
  name: 'pdf',
  displayName: 'PDF',
  icon: PDF_ICON,
  color: PDF_BRAND_COLOR,
  description: 'Read, create, inspect, render, verify, and extract content from PDF files.',
  tags: ['skill', 'pdf', 'reportlab', 'pdfplumber', 'pypdf']
}

const PDF_MARKETPLACE = {
  screenshots: [PDF_TRIAL_CARD_BACKGROUND],
  trialShortcuts: PDF_TRIAL_SHORTCUTS,
  contents: [PDF_MARKETPLACE_CONTENT]
}

@Module({})
export class PdfSkillPlugin {}

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
      purpose:
        'Run shell commands from the installed skill runtime directory for PDF generation, extraction, rendering, and verification.'
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
    executables: ['python', 'pdftoppm', 'pdfinfo'],
    packages: ['reportlab', 'pdfplumber', 'pypdf']
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
        capabilities: ['pdf', 'pdf-skill'],
        runtime: runtimeRequirements,
        marketplace: PDF_MARKETPLACE
      }
    },
    category: 'tools',
    displayName: 'PDF',
    description:
      'Skill-only Xpert plugin for PDF workflows converted from Codex primary-runtime PDF 26.630.12135.',
    icon: PDF_LOGO,
    keywords: ['pdf', 'pdfs', 'documents', 'render', 'review', 'extract', 'pdfplumber', 'pypdf', 'reportlab', 'skill'],
    author: 'XpertAI'
  },
  register() {
    return { module: PdfSkillPlugin, global: true }
  }
}

export default plugin
