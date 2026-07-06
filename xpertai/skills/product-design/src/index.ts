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

function readAssetDataUrl(path: string, mimeType: string) {
  const bytes = readFileSync(join(moduleDir, path))
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

const PRODUCT_DESIGN_ICON = {
  type: 'image',
  value: readAssetDataUrl('../assets/composerIcon.svg', 'image/svg+xml')
} as const

const PRODUCT_DESIGN_LOGO = {
  type: 'image',
  value: readAssetDataUrl('../assets/logo.png', 'image/png')
} as const

const PRODUCT_DESIGN_BRAND_COLOR = '#FF66AD'

const PRODUCT_DESIGN_TRIAL_PROMPTS = [
  'Help me get started',
  'Turn this product idea into three visual directions',
  'Clone this URL into an editable prototype'
] as const

const PRODUCT_DESIGN_TRIAL_CARD_BACKGROUND =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201200%20380%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffe4f1%22%2F%3E%3Cstop%20offset%3D%220.48%22%20stop-color%3D%22%23fdf2f8%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e0f2fe%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221200%22%20height%3D%22380%22%20fill%3D%22url(%23g)%22%2F%3E%3Cg%20opacity%3D%220.32%22%20transform%3D%22translate(735%2056)%20rotate(6)%22%3E%3Crect%20width%3D%22284%22%20height%3D%22192%22%20rx%3D%2228%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2234%22%20width%3D%22156%22%20height%3D%2218%22%20rx%3D%229%22%20fill%3D%22%23FF66AD%22%20opacity%3D%220.72%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2278%22%20width%3D%22220%22%20height%3D%2230%22%20rx%3D%2215%22%20fill%3D%22%23FF66AD%22%20opacity%3D%220.26%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%22122%22%20width%3D%22102%22%20height%3D%2238%22%20rx%3D%2219%22%20fill%3D%22%230ea5e9%22%20opacity%3D%220.36%22%2F%3E%3Crect%20x%3D%22148%22%20y%3D%22122%22%20width%3D%22104%22%20height%3D%2238%22%20rx%3D%2219%22%20fill%3D%22%23FF66AD%22%20opacity%3D%220.36%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M86%20318C198%20224%20320%20112%20478%20142c116%2022%20155%20120%20284%2094%20128-26%20178-122%20330-74%2046%2015%2084%2042%20118%2074v82H86z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.28%22%2F%3E%3C%2Fsvg%3E'

const PRODUCT_DESIGN_TRIAL_SHORTCUTS = PRODUCT_DESIGN_TRIAL_PROMPTS.map((prompt, index) => ({
  id: `product-design-${index + 1}`,
  prompt,
  skillKey: 'product-design',
  icon: PRODUCT_DESIGN_ICON
}))

const PRODUCT_DESIGN_SKILLS = [
  {
    name: 'product-design',
    displayName: 'Product Design',
    description:
      'Route Product Design setup, brief confirmation, research, audits, ideation, prototypes, URL clones, image-to-code builds, QA, and sharing.'
  },
  {
    name: 'user-context',
    displayName: 'User Context',
    description: 'Save and read Product Design user context.'
  },
  {
    name: 'get-context',
    displayName: 'Get Context',
    description: 'Confirm the Product Design brief before design or build work.'
  },
  {
    name: 'research',
    displayName: 'Research',
    description: 'Research UX pain and workflow friction for a digital product.'
  },
  {
    name: 'audit',
    displayName: 'Audit',
    description: 'Audit or critique product UX and design from captured screenshots.'
  },
  {
    name: 'ideate',
    displayName: 'Ideate',
    description: 'Generate visual directions after brief confirmation.'
  },
  {
    name: 'prototype',
    displayName: 'Prototype',
    description: 'Route prototype, redesign, clone, and UI build requests after brief confirmation.'
  },
  {
    name: 'url-to-code',
    displayName: 'URL To Code',
    description: 'Clone a live URL into a runnable frontend prototype after brief confirmation.'
  },
  {
    name: 'image-to-code',
    displayName: 'Image To Code',
    description: 'Build a responsive frontend from a selected visual target after brief confirmation.'
  },
  {
    name: 'design-qa',
    displayName: 'Design QA',
    description: 'Compare a coded prototype against its visual source before handoff.'
  },
  {
    name: 'share',
    displayName: 'Share',
    description: 'Deploy a runnable prototype and return a shareable URL.'
  }
] as const

const PRODUCT_DESIGN_SKILL_CONTENTS = PRODUCT_DESIGN_SKILLS.map((skill) => ({
  type: 'skill',
  name: skill.name,
  displayName: skill.displayName,
  icon: PRODUCT_DESIGN_ICON,
  color: PRODUCT_DESIGN_BRAND_COLOR,
  description: skill.description,
  tags: ['skill', 'product-design']
}))

@Module({})
export class ProductDesignSkillPlugin {}

const runtimeRequirements = {
  compatibleTools: [
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxShell',
      name: 'sandbox_shell',
      required: false,
      purpose: 'Run shell, Node, npm, and Python commands for prototype bootstrap, local preview, preflight scripts, and QA.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_read_file',
      required: false,
      purpose: 'Read generated prototype files, saved context, reference assets, and local source files.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_glob',
      required: false,
      purpose: 'Find files by glob pattern while inspecting existing projects or generated prototypes.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_grep',
      required: false,
      purpose: 'Search file contents while inspecting existing projects or generated prototypes.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_write_file',
      required: false,
      purpose: 'Create generated prototype files and local workflow artifacts.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_append_file',
      required: false,
      purpose: 'Append larger generated prototype files and local workflow artifacts.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_edit_file',
      required: false,
      purpose: 'Edit generated prototype files and local workflow artifacts.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_multi_edit_file',
      required: false,
      purpose: 'Apply multiple edits to generated prototype files and local workflow artifacts.'
    },
    {
      kind: 'agent-middleware-tool',
      provider: 'SandboxFile',
      name: 'sandbox_list_dir',
      required: false,
      purpose: 'List workspace directories while inspecting existing projects or generated prototypes.'
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
    executables: ['node', 'npm', 'python3']
  },
  optionalRuntime: {
    tools: ['Browser', 'Chrome', 'Playwright', 'Figma', 'Canva', 'image_gen', 'Sites', 'Vercel'],
    packages: ['vite', 'react', 'react-dom'],
    integrations: [
      'Figma or Canva for design review boards',
      'Sites, Vercel, or another hosting target for prototype sharing'
    ]
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
        capabilities: [
          'product-design',
          'prototype',
          'frontend',
          'ux-research',
          'ux-audit',
          'accessibility-audit',
          'research',
          'context-gathering',
          'ideation',
          'image-to-code',
          'url-to-code'
        ],
        runtime: runtimeRequirements,
        // Compatibility: plugin-sdk 3.10.1 does not type trialShortcuts yet.
        marketplace: {
          category: 'creativity',
          screenshots: [PRODUCT_DESIGN_TRIAL_CARD_BACKGROUND],
          trialShortcuts: PRODUCT_DESIGN_TRIAL_SHORTCUTS,
          contents: PRODUCT_DESIGN_SKILL_CONTENTS
        } as any
      }
    },
    category: 'tools',
    displayName: 'Product Design',
    description:
      'Skill-only Xpert plugin for Product Design workflows converted from Codex Product Design skill plugin 0.1.47.',
    icon: PRODUCT_DESIGN_LOGO,
    keywords: [
      'product-design',
      'prototype',
      'frontend',
      'ux-research',
      'ux-audit',
      'accessibility-audit',
      'research',
      'context-gathering',
      'ideation',
      'image-generation',
      'skill'
    ],
    author: 'XpertAI'
  },
  register() {
    return { module: ProductDesignSkillPlugin, global: true }
  }
}

export default plugin
