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

const PRESENTATIONS_ICON = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/icon.png')
} as const

const PRESENTATIONS_LOGO = {
  type: 'image',
  value: readPngAssetDataUrl('../assets/logo.png')
} as const

const PRESENTATIONS_BRAND_COLOR = '#C43E1C'

const PRESENTATIONS_TRIAL_PROMPTS = [
  'Create a slide deck about the solar system',
  "Research this company's latest earnings and create a slide deck on the company's financial performance",
  'Create a visually stunning slide deck about the latest AI trends'
] as const

const PRESENTATIONS_TRIAL_CARD_BACKGROUND =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201200%20380%22%20preserveAspectRatio%3D%22none%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffedd5%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220.52%22%20stop-color%3D%22%23fff7ed%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fed7aa%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22r%22%20cx%3D%220.24%22%20cy%3D%220.08%22%20r%3D%220.9%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.92%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23g)%22%2F%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23r)%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M80%20315C205%20238%20303%20102%20458%20133c126%2026%20157%20137%20292%20100%20128-35%20170-145%20320-94%2058%2020%20100%2058%20148%20110v131H80z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.24%22%2F%3E%0A%20%20%3Cg%20opacity%3D%220.3%22%20transform%3D%22translate(780%2072)%20rotate(7)%22%3E%0A%20%20%20%20%3Crect%20width%3D%22260%22%20height%3D%22172%22%20rx%3D%2224%22%20fill%3D%22%23ffffff%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%2236%22%20y%3D%2242%22%20width%3D%22188%22%20height%3D%2218%22%20rx%3D%229%22%20fill%3D%22%23C43E1C%22%20opacity%3D%220.68%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%2236%22%20y%3D%2282%22%20width%3D%22118%22%20height%3D%2254%22%20rx%3D%2218%22%20fill%3D%22%23C43E1C%22%20opacity%3D%220.32%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%22170%22%20y%3D%2288%22%20width%3D%2254%22%20height%3D%2210%22%20rx%3D%225%22%20fill%3D%22%23C43E1C%22%20opacity%3D%220.42%22%2F%3E%0A%20%20%20%20%3Crect%20x%3D%22170%22%20y%3D%22112%22%20width%3D%2242%22%20height%3D%2210%22%20rx%3D%225%22%20fill%3D%22%23C43E1C%22%20opacity%3D%220.32%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E'

const PRESENTATIONS_TRIAL_SHORTCUTS = PRESENTATIONS_TRIAL_PROMPTS.map((prompt, index) => ({
  id: `presentations-${index + 1}`,
  prompt,
  skillKey: 'presentations',
  icon: PRESENTATIONS_ICON
}))

@Module({})
export class PresentationsSkillPlugin {}

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
      purpose: 'Run shell commands from the installed skill runtime directory for deck generation, rendering, and QA.'
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
      purpose: 'Optional Python execution helper for bundled rendering and inspection scripts.'
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
    executables: ['node', 'python'],
    packages: ['@oai/artifact-tool']
  },
  optionalRuntime: {
    executables: ['dot'],
    packages: ['Pillow'],
    tools: ['image_gen', 'image_search'],
    integrations: ['Google Drive presentation import for native Google Slides output']
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
        capabilities: ['presentations', 'presentations-skill'],
        runtime: runtimeRequirements,
        marketplace: {
          screenshots: [PRESENTATIONS_TRIAL_CARD_BACKGROUND],
          trialShortcuts: PRESENTATIONS_TRIAL_SHORTCUTS,
          contents: [
            {
              type: 'skill',
              name: 'presentations',
              displayName: 'Presentations',
              icon: PRESENTATIONS_ICON,
              color: PRESENTATIONS_BRAND_COLOR,
              description:
                'Create, edit, render, verify, and export PowerPoint or Google Slides-targeted presentation decks.',
              tags: ['skill', 'presentations', 'slides', 'pptx']
            }
          ]
        } as any
      }
    },
    category: 'tools',
    displayName: 'Presentations',
    description:
      'Skill-only Xpert plugin for presentation workflows converted from Codex primary-runtime Presentations 26.630.12135.',
    icon: PRESENTATIONS_LOGO,
    keywords: ['presentations', 'slides', 'pptx', 'powerpoint', 'google-slides', 'skill'],
    author: 'XpertAI'
  },
  register() {
    return { module: PresentationsSkillPlugin, global: true }
  }
}

export default plugin
