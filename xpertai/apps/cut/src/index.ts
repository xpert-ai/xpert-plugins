import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  CUT_AGENT_CAPABILITY,
  CUT_ARTIFACT_NAMESPACE,
  CUT_FEATURE,
  CUT_ICON,
  CUT_MCP_CAPABILITY,
  CUT_MIDDLEWARE_NAME,
  CUT_PROVIDER_KEY,
  CUT_TEMPLATE_CAPABILITY,
  CUT_TEMPLATE_PROVIDER_KEY,
  CUT_WORKBENCH_CAPABILITY,
  CUT_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { CutPlugin } from './lib/cut.plugin.js'
import { cutTemplates } from './lib/cut.templates.js'
import { CUT_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as { name: string; version: string }
const ConfigSchema = z.object({})
const operations = [
  { name: 'cut_create_projects', displayName: 'Create Cut projects', description: 'Create scoped, versioned video-editing projects.', access: 'write' as const },
  { name: 'cut_edit_timelines', displayName: 'Edit Cut timelines', description: 'Import media, create evidence-backed review proposals, and apply revision-safe atomic clip, property, track, batch, and save operations.', access: 'write' as const },
  { name: 'cut_transcribe_captions', displayName: 'Transcribe and review captions', description: 'Queue platform-model transcription, import/export subtitles, review drafts, and commit approved captions.', access: 'write' as const },
  { name: 'cut_review_export', displayName: 'Review and export', description: 'Open Cut Workbench, review timelines, and export MP4 locally or through a bounded Sandbox Job.', access: 'write' as const }
]

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    artifactNamespace: CUT_ARTIFACT_NAMESPACE,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [CUT_FEATURE, CUT_WORKBENCH_CAPABILITY, CUT_AGENT_CAPABILITY, CUT_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            { type: 'app', name: 'cut', displayName: 'Cut', description: 'Agentic non-linear video editor with browser and headless MP4 export.', icon: { type: 'svg', value: CUT_ICON, color: '#0ea5e9' }, operations },
            { type: 'view', name: CUT_WORKBENCH_VIEW_KEY, displayName: 'Cut Workbench', description: 'Media preview, timeline editing, version review, and export.', metadata: { app: 'cut' } },
            { type: 'middleware', name: CUT_MIDDLEWARE_NAME, displayName: 'Cut Agent Tools', description: 'Tools for project, media, timeline, transcription, caption review, version, and failure operations.', metadata: { app: 'cut' } },
            { type: 'assistant-template', name: 'cut-assistant', displayName: 'Cut Assistant Template', description: 'Prebuilt assistant for video editing workflows.', metadata: { app: 'cut' } }
          ]
        },
        runtime: { middlewareProviders: [CUT_MIDDLEWARE_NAME], viewProviders: [CUT_PROVIDER_KEY], templateProviders: [CUT_TEMPLATE_PROVIDER_KEY] }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle', 'mcp-server', 'tool'],
        capabilities: [CUT_FEATURE, CUT_WORKBENCH_CAPABILITY, CUT_AGENT_CAPABILITY, CUT_TEMPLATE_CAPABILITY, CUT_MCP_CAPABILITY],
        marketplace: {
          contents: [
            { type: 'skill', name: 'cut-agent-skill', displayName: 'Cut Agent Skill', description: 'Use Cut project, media, timeline edit, version, and failure tools.', tags: ['skill', 'cut', 'video', 'timeline'] },
            { type: 'assistant-template', name: 'cut-assistant', displayName: 'Cut Assistant', description: 'Assistant template for video editing.', metadata: { app: 'cut' } },
            { type: 'app', name: 'cut', displayName: 'Cut', description: 'Agentic non-linear video editor.', operations },
            { type: 'view', name: CUT_WORKBENCH_VIEW_KEY, displayName: 'Cut Workbench', description: 'Video editing Workbench.', metadata: { app: 'cut' } },
            { type: 'middleware', name: CUT_MIDDLEWARE_NAME, displayName: 'Cut Agent Tools', description: 'Scoped Cut editing tools.', metadata: { app: 'cut' } },
            { type: 'tool', name: 'cut-ir-mcp', displayName: 'Cut IR MCP Tools', description: 'Portable, side-effect-free Cut project validation, comparison, and in-memory editing tools.', metadata: { app: 'cut', protocol: 'mcp' } }
          ]
        }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: CUT_ICON, color: '#0ea5e9' },
    displayName: 'Cut',
    description: 'Agentic non-linear video editor with media intelligence, reviewable edit proposals and captions, revision-safe tools, and browser or Sandbox Job MP4 export.',
    keywords: ['cut', 'video', 'timeline', 'opencut', 'editor', 'workbench', 'agent', 'captions', 'speech-to-text'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  permissions: [{ type: 'speech_to_text', operations: ['transcribe'] }],
  templates: cutTemplates,
  register(ctx) {
    ctx.logger.log('register cut plugin')
    return {
      module: CutPlugin,
      global: true,
      providers: [{ provide: CUT_PLUGIN_CONTEXT, useValue: ctx }]
    }
  },
  async onStart(ctx) { ctx.logger.log('cut plugin started') },
  async onStop(ctx) { ctx.logger.log('cut plugin stopped') }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/cut-project.js'
export * from './lib/cut-caption.js'
export * from './lib/cut-caption.service.js'
export * from './lib/cut-media-intelligence.service.js'
export * from './lib/cut-proposal.js'
export * from './lib/cut-proposal.service.js'
export * from './lib/cut-render.service.js'
export * from './lib/cut-render.processor.js'
export * from './lib/cut-transcription.js'
export * from './lib/cut-transcription-media.service.js'
export * from './lib/cut-sandbox-whisper.service.js'
export * from './lib/cut-transcription.processor.js'
export * from './lib/cut-host-event.js'
export * from './lib/cut-timeline.js'
export * from './lib/entities/index.js'
export * from './lib/cut.plugin.js'
export * from './lib/cut.service.js'
export * from './lib/cut.middleware.js'
export * from './lib/cut-view.provider.js'
export * from './lib/cut.templates.js'
export * from './lib/tokens.js'
