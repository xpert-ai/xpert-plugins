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

const SPREADSHEETS_ICON = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/icon.png')
} as const

const SPREADSHEETS_LOGO = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/logo.png')
} as const

const SPREADSHEETS_BRAND_COLOR = '#107C41'

const SPREADSHEETS_TRIAL_PROMPTS = [
  "Create a spreadsheet to analyze this company's financials",
  'Create a corporate expense report template for my company',
  'Take this bank statement CSV and create a full spreadsheet to analyze my transactions'
] as const

const SPREADSHEETS_TRIAL_CARD_BACKGROUND =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201200%20380%22%20preserveAspectRatio%3D%22none%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23dcfce7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220.48%22%20stop-color%3D%22%23f0fdf4%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23bbf7d0%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22r%22%20cx%3D%220.2%22%20cy%3D%220.05%22%20r%3D%220.9%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.92%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23g)%22%2F%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23r)%22%2F%3E%0A%20%20%3Cg%20opacity%3D%220.22%22%20stroke%3D%22%23107C41%22%20stroke-width%3D%222%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M90%2092h1020M90%20150h1020M90%20208h1020M90%20266h1020M90%20324h1020%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M172%2064v292M304%2064v292M436%2064v292M568%2064v292M700%2064v292M832%2064v292M964%2064v292%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Cg%20opacity%3D%220.28%22%20transform%3D%22translate(820%2056)%20rotate(-6)%22%3E%0A%20%20%20%20%3Crect%20width%3D%22220%22%20height%3D%22220%22%20rx%3D%2234%22%20fill%3D%22%23ffffff%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M0%2072h220M0%20144h220M72%200v220M144%200v220%22%20stroke%3D%22%23107C41%22%20stroke-width%3D%2214%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.66%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E'

const SPREADSHEETS_TRIAL_SHORTCUTS = SPREADSHEETS_TRIAL_PROMPTS.map((prompt, index) => ({
  id: `spreadsheets-${index + 1}`,
  prompt,
  skillKey: 'spreadsheets',
  icon: SPREADSHEETS_ICON
}))

@Module({})
export class SpreadsheetsSkillPlugin {}

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
      purpose: 'Run shell commands from the installed skill runtime directory for workbook generation and verification.'
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
      purpose: 'Optional Python execution helper for analysis and extraction scripts.'
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
    executables: ['node'],
    packages: ['@oai/artifact-tool']
  },
  optionalRuntime: {
    executables: ['python'],
    packages: ['pandas', 'numpy', 'pypdf', 'python-docx', 'reportlab'],
    integrations: ['Google Drive spreadsheet import for native Google Sheets output']
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
        capabilities: ['spreadsheets', 'spreadsheets-skill'],
        runtime: runtimeRequirements,
        marketplace: {
          screenshots: [SPREADSHEETS_TRIAL_CARD_BACKGROUND],
          trialShortcuts: SPREADSHEETS_TRIAL_SHORTCUTS,
          contents: [
            {
              type: 'skill',
              name: 'spreadsheets',
              displayName: 'Spreadsheets',
              icon: SPREADSHEETS_ICON,
              color: SPREADSHEETS_BRAND_COLOR,
              description:
                'Create, edit, analyze, visualize, render, and verify spreadsheet artifacts and Google Sheets-targeted workbooks.',
              tags: ['skill', 'spreadsheets', 'excel', 'xlsx']
            }
          ]
        } as any
      }
    },
    category: 'tools',
    displayName: 'Spreadsheets',
    description:
      'Skill-only Xpert plugin for spreadsheet workflows converted from Codex primary-runtime Spreadsheets 26.630.12135.',
    icon: SPREADSHEETS_LOGO,
    keywords: ['spreadsheets', 'excel', 'xlsx', 'csv', 'google-sheets', 'skill'],
    author: 'XpertAI'
  },
  register() {
    return { module: SpreadsheetsSkillPlugin, global: true }
  }
}

export default plugin
