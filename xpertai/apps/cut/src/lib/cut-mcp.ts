import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v3'
import {
  applyCutEdit,
  createStarterCutProject,
  cutEditOperationSchema,
  cutProjectDocumentSchema,
  validateCutProjectDocument
} from './cut-project.js'
import type { CutEditOperation, CutProjectDocument } from './types.js'

export const CUT_MCP_SERVER_NAME = 'xpert-cut-ir'
export const CUT_MCP_SERVER_VERSION = '0.1.0'
export const CUT_MCP_TOOL_NAMES = [
  'cut_ir_create_project',
  'cut_ir_validate_project',
  'cut_ir_apply_operations',
  'cut_ir_compare_projects'
] as const

const MAX_MCP_DOCUMENT_BYTES = 2 * 1024 * 1024
const MAX_MCP_CLIPS = 2_000

const starterProjectInputSchema = {
  width: z.number().int().min(16).max(7_680).optional().describe('Canvas width in pixels.'),
  height: z.number().int().min(16).max(4_320).optional().describe('Canvas height in pixels.'),
  fps: z.number().int().min(1).max(120).optional().describe('Project frames per second.'),
  durationSeconds: z.number().finite().min(0.1).max(3_600).optional().describe('Project duration in seconds.')
}

const documentInputSchema = {
  document: cutProjectDocumentSchema.describe('A complete CutProjectDocument schemaVersion 1 value.')
}

const applyOperationsInputSchema = {
  document: cutProjectDocumentSchema.describe('The immutable source CutProjectDocument schemaVersion 1 value.'),
  operations: z.array(cutEditOperationSchema).min(1).max(100)
    .describe('One to one hundred ordered Cut edit operations applied atomically in memory.')
}

const compareProjectsInputSchema = {
  before: cutProjectDocumentSchema.describe('The source Cut project document.'),
  after: cutProjectDocumentSchema.describe('The candidate Cut project document.')
}

type StarterProjectInput = {
  width?: number
  height?: number
  fps?: number
  durationSeconds?: number
}

export interface CutIrDocumentSummary {
  schemaVersion: 1
  width: number
  height: number
  fps: number
  projectDurationSeconds: number
  contentDurationSeconds: number
  trackCount: number
  visualTrackCount: number
  audioTrackCount: number
  clipCount: number
  videoClipCount: number
  imageClipCount: number
  audioClipCount: number
  textClipCount: number
  colorClipCount: number
  bookmarkCount: number
}

export interface CutIrDocumentDiff {
  changed: boolean
  settingsChanged: boolean
  changedTrackIds: string[]
  changedClipIds: string[]
  before: CutIrDocumentSummary
  after: CutIrDocumentSummary
}

export function summarizeCutIrDocument(value: CutProjectDocument): CutIrDocumentSummary {
  const document = validateMcpDocument(value)
  const clips = document.tracks.flatMap((track) => track.clips)
  const count = (type: typeof clips[number]['type']) => clips.filter((clip) => clip.type === type).length
  const contentDurationSeconds = clips.reduce(
    (maximum, clip) => Math.max(maximum, clip.start + clip.duration),
    0
  )

  return {
    schemaVersion: 1,
    width: document.settings.width,
    height: document.settings.height,
    fps: document.settings.fps,
    projectDurationSeconds: document.settings.durationSeconds,
    contentDurationSeconds: roundSeconds(contentDurationSeconds),
    trackCount: document.tracks.length,
    visualTrackCount: document.tracks.filter((track) => track.kind === 'visual').length,
    audioTrackCount: document.tracks.filter((track) => track.kind === 'audio').length,
    clipCount: clips.length,
    videoClipCount: count('video'),
    imageClipCount: count('image'),
    audioClipCount: count('audio'),
    textClipCount: count('text'),
    colorClipCount: count('color'),
    bookmarkCount: document.bookmarks?.length ?? 0
  }
}

export function compareCutIrDocuments(beforeValue: CutProjectDocument, afterValue: CutProjectDocument): CutIrDocumentDiff {
  const before = validateMcpDocument(beforeValue)
  const after = validateMcpDocument(afterValue)
  const beforeTracks = new Map(before.tracks.map((track, index) => [track.id, { track, index }] as const))
  const afterTracks = new Map(after.tracks.map((track, index) => [track.id, { track, index }] as const))
  const beforeClips = new Map(before.tracks.flatMap((track) => track.clips.map((clip, index) => [
    clip.id,
    { clip, trackId: track.id, index }
  ] as const)))
  const afterClips = new Map(after.tracks.flatMap((track) => track.clips.map((clip, index) => [
    clip.id,
    { clip, trackId: track.id, index }
  ] as const)))
  const changedTrackIds = changedIds(beforeTracks, afterTracks)
  const changedClipIds = changedIds(beforeClips, afterClips)
  const settingsChanged = JSON.stringify(before.settings) !== JSON.stringify(after.settings)
    || JSON.stringify(before.bookmarks ?? []) !== JSON.stringify(after.bookmarks ?? [])

  return {
    changed: settingsChanged || changedTrackIds.length > 0 || changedClipIds.length > 0,
    settingsChanged,
    changedTrackIds,
    changedClipIds,
    before: summarizeCutIrDocument(before),
    after: summarizeCutIrDocument(after)
  }
}

export function buildCutIrCreateResult(input: StarterProjectInput = {}): CallToolResult {
  const document = validateMcpDocument(createStarterCutProject(input))
  return documentResult('cut.ir.project-created', 'Created an in-memory Cut IR v1 project document.', document)
}

export function buildCutIrValidateResult(value: CutProjectDocument): CallToolResult {
  const document = validateMcpDocument(value)
  return documentResult('cut.ir.project-validated', 'The Cut IR v1 project document is valid.', document)
}

export function buildCutIrApplyResult(value: CutProjectDocument, operationValues: CutEditOperation[]): CallToolResult {
  const source = validateMcpDocument(value)
  const operations = z.array(cutEditOperationSchema).min(1).max(100).parse(operationValues)
  let document = source
  for (const operation of operations) {
    document = validateMcpDocument(applyCutEdit(document, operation))
  }
  const diff = compareCutIrDocuments(source, document)

  return {
    content: [{
      type: 'text',
      text: `Applied ${operations.length} in-memory Cut IR operation${operations.length === 1 ? '' : 's'}; ${diff.changedClipIds.length} clip(s) and ${diff.changedTrackIds.length} track(s) changed.`
    }],
    structuredContent: {
      kind: 'cut.ir.operations-applied',
      schemaVersion: 1,
      operationCount: operations.length,
      document,
      summary: summarizeCutIrDocument(document),
      diff
    }
  }
}

export function buildCutIrCompareResult(before: CutProjectDocument, after: CutProjectDocument): CallToolResult {
  const diff = compareCutIrDocuments(before, after)
  return {
    content: [{
      type: 'text',
      text: diff.changed
        ? `${diff.changedClipIds.length} clip(s), ${diff.changedTrackIds.length} track(s), and ${diff.settingsChanged ? 'project settings/bookmarks' : 'no project settings'} changed.`
        : 'The two Cut IR v1 project documents are equivalent.'
    }],
    structuredContent: {
      kind: 'cut.ir.projects-compared',
      schemaVersion: 1,
      diff
    }
  }
}

export function registerCutMcpTools(server: McpServer) {
  server.registerTool(CUT_MCP_TOOL_NAMES[0], {
    title: 'Create Cut IR Project',
    description: 'Create a standalone CutProjectDocument v1 in memory. This tool does not create a persisted Xpert project or access tenant data.',
    inputSchema: starterProjectInputSchema,
    annotations: pureTransformationAnnotations(false)
  }, (input) => safeToolResult(() => buildCutIrCreateResult(input)))

  server.registerTool(CUT_MCP_TOOL_NAMES[1], {
    title: 'Validate Cut IR Project',
    description: 'Validate and canonicalize a caller-supplied CutProjectDocument v1 without filesystem, network, tenant, or database access.',
    inputSchema: documentInputSchema,
    annotations: pureTransformationAnnotations(true)
  }, ({ document }) => safeToolResult(() => buildCutIrValidateResult(document)))

  server.registerTool(CUT_MCP_TOOL_NAMES[2], {
    title: 'Apply Cut IR Operations',
    description: 'Atomically apply ordered edits to a caller-supplied CutProjectDocument v1 and return a new document plus diff. Persist it separately with Xpert native revision-safe tools.',
    inputSchema: applyOperationsInputSchema,
    annotations: pureTransformationAnnotations(false)
  }, ({ document, operations }) => safeToolResult(() => buildCutIrApplyResult(document, operations)))

  server.registerTool(CUT_MCP_TOOL_NAMES[3], {
    title: 'Compare Cut IR Projects',
    description: 'Compare two caller-supplied CutProjectDocument v1 values and return changed track and clip identifiers without external side effects.',
    inputSchema: compareProjectsInputSchema,
    annotations: pureTransformationAnnotations(true)
  }, ({ before, after }) => safeToolResult(() => buildCutIrCompareResult(before, after)))
}

function documentResult(kind: string, text: string, document: CutProjectDocument): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      kind,
      schemaVersion: 1,
      document,
      summary: summarizeCutIrDocument(document)
    }
  }
}

function safeToolResult(run: () => CallToolResult): CallToolResult {
  try {
    return run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Cut IR request failed: ${message}` }],
      structuredContent: {
        kind: 'cut.ir.error',
        error: { code: 'CUT_IR_INVALID', message }
      },
      isError: true
    }
  }
}

function validateMcpDocument(value: CutProjectDocument) {
  const document = validateCutProjectDocument(value)
  const clipCount = document.tracks.reduce((total, track) => total + track.clips.length, 0)
  if (clipCount > MAX_MCP_CLIPS) {
    throw new Error(`Cut MCP documents support at most ${MAX_MCP_CLIPS} clips; received ${clipCount}.`)
  }
  const byteLength = Buffer.byteLength(JSON.stringify(document), 'utf8')
  if (byteLength > MAX_MCP_DOCUMENT_BYTES) {
    throw new Error(`Cut MCP documents support at most ${MAX_MCP_DOCUMENT_BYTES} UTF-8 JSON bytes; received ${byteLength}.`)
  }
  return document
}

function changedIds<T>(before: Map<string, T>, after: Map<string, T>) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)))
    .sort((left, right) => left.localeCompare(right))
}

function pureTransformationAnnotations(idempotentHint: boolean) {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint,
    openWorldHint: false
  }
}

function roundSeconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}
