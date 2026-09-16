import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import { CUT_MIDDLEWARE_TOOL_NAMES } from './constants.js'

export const CUT_TOOL_PROFILE_IDS = ['base', 'project-prepare', 'speech-evidence', 'timeline-structure', 'timeline-visual', 'timeline-audio', 'timeline-text', 'project-settings', 'cover', 'generic-edit', 'proposal-create', 'proposal-manage', 'proposal-undo', 'caption-authoring', 'caption-commit', 'export-video', 'export-subtitle', 'version-finalize', 'diagnostics', 'task-control'] as const
export type CutToolProfileId = typeof CUT_TOOL_PROFILE_IDS[number]
export const CUT_DISCOVER_TOOLS = 'cut_discover_tools'
export const CUT_EXECUTE_TOOL = 'cut_execute_tool'
const profileIdSchema = z.enum(CUT_TOOL_PROFILE_IDS)
const profileSchema = z.object({
  id: profileIdSchema,
  tools: z.array(z.enum(CUT_MIDDLEWARE_TOOL_NAMES)),
  skills: z.array(z.enum(['cut-agent-skill', 'cut-speech-editing', 'cut-captions', 'cut-verification', 'cut-export']))
}).strict()
const catalogueSchema = z.object({ version: z.literal(1), profiles: z.array(profileSchema) }).strict()
// Both native execution and portable packages consume this shared, versioned catalogue.
export const CUT_TOOL_PROFILES = catalogueSchema.parse(JSON.parse(readFileSync(
  new URL('../../skills/cut-agent-skill/references/tool-profiles.json', import.meta.url), 'utf8'
))).profiles
export const cutDiscoverySchema = z.object({
  profiles: z.array(z.union([profileIdSchema, z.literal('detail-reads')])).max(21).default([])
}).strict()
export const cutExecutionSchema = z.object({
  profile: z.union([profileIdSchema, z.literal('detail-reads')]),
  operation: z.enum(CUT_MIDDLEWARE_TOOL_NAMES),
  arguments: z.record(z.unknown())
}).strict()

// MCP exposes these as Resources. Native Xpert must retain their callable equivalents.
export const CUT_DETAIL_READS = ['cut_get_project', 'cut_get_clip', 'cut_get_media_asset',
  'cut_get_analysis_job', 'cut_get_media_segment', 'cut_get_edit_proposal', 'cut_get_caption_draft'] as const

export function cutProfileTools(profile: string): readonly string[] {
  return profile === 'detail-reads' ? CUT_DETAIL_READS : CUT_TOOL_PROFILES.find((item) => item.id === profile)?.tools ?? []
}

export function cutProfileInstructions() {
  return [
    'Cut exposes four base queries, cut_discover_tools and cut_execute_tool. Operation schemas remain inside the plugin.',
    'Call cut_discover_tools with the smallest relevant profiles to read operation descriptions and JSON schemas, then use cut_execute_tool with profile, operation and arguments.',
    'Discovery does not execute, authorize or confirm changes. Preserve user approval and revision checks. Never treat operation discovery as approval.',
    'For ongoing tasks discover detail-reads to query jobs, proposals and captions; task-control to cancel jobs; proposal-manage to apply or reject reviewed proposals. These remain accessible across turns and stages.',
    'Use diagnostics only for actual failures, version-finalize only for requested milestones, and proposal-undo only for requested undo.',
    `Profiles: ${CUT_TOOL_PROFILE_IDS.join(', ')}, detail-reads.`
  ].join('\n')
}
