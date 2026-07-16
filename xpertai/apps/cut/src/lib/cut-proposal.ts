import { z } from 'zod/v3'
import { applyCutEdit, validateCutProjectDocument } from './cut-project.js'
import { cutEditOperationSchema } from './cut-project.js'
import type {
  CutEditOperation,
  CutEditProposalItem,
  CutProjectDocument,
  CutProposalRisk
} from './types.js'

export const cutProposalSegmentIdSchema = z.string().regex(
  /^(transcript|analysis):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
)

export const cutProposalConstraintsSchema = z.object({
  targetDurationSeconds: z.number().positive().max(3_600).optional(),
  preserveTopics: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  removeSilence: z.boolean().optional(),
  notes: z.string().trim().min(1).max(2_000).optional()
}).strict()

export const cutProposalItemInputSchema = z.object({
  operation: cutEditOperationSchema,
  summary: z.string().trim().min(1).max(500),
  evidenceSegmentIds: z.array(cutProposalSegmentIdSchema).min(1).max(8),
  confidence: z.number().min(0).max(1),
  risk: z.enum(['low', 'medium', 'high']).optional()
}).strict()

export const cutProposalItemsInputSchema = z.array(cutProposalItemInputSchema).min(1).max(50)

export function buildCutProposalPreview(source: CutProjectDocument, items: CutEditProposalItem[]) {
  const sourceDocument = validateCutProjectDocument(source)
  const document = items.filter((item) => item.enabled).reduce(
    (current, item) => applyCutEdit(current, item.operation),
    sourceDocument
  )
  return {
    document,
    changedClipIds: changedClipIds(sourceDocument, document),
    changedTrackIds: changedTrackIds(sourceDocument, document),
    estimatedDurationSeconds: contentDuration(document)
  }
}

export function minimumCutProposalRisk(document: CutProjectDocument, operation: CutEditOperation): CutProposalRisk {
  if (operation.kind === 'manage_track' && operation.mutation.action === 'delete') return 'high'
  if (operation.kind === 'delete_clips') {
    const clips = document.tracks.flatMap((track) => track.clips).filter((clip) => operation.clipIds.includes(clip.id))
    const removed = clips.reduce((total, clip) => total + clip.duration, 0)
    return clips.length >= 3 || removed >= document.settings.durationSeconds * 0.2 ? 'high' : 'medium'
  }
  if (['trim', 'move', 'duplicate_clips', 'update_clip_timing', 'add_clip'].includes(operation.kind)) return 'medium'
  return 'low'
}

export function maxCutProposalRisk(left: CutProposalRisk | undefined, right: CutProposalRisk): CutProposalRisk {
  const rank: Record<CutProposalRisk, number> = { low: 0, medium: 1, high: 2 }
  return left && rank[left] > rank[right] ? left : right
}

export function cutDocumentsEqual(left: CutProjectDocument, right: CutProjectDocument) {
  return JSON.stringify(validateCutProjectDocument(left)) === JSON.stringify(validateCutProjectDocument(right))
}

function contentDuration(document: CutProjectDocument) {
  const end = document.tracks
    .filter((track) => !track.hidden)
    .flatMap((track) => track.clips)
    .reduce((maximum, clip) => Math.max(maximum, clip.start + clip.duration), 0)
  return Math.round(Math.min(document.settings.durationSeconds, end) * 1_000) / 1_000
}

function changedClipIds(previous: CutProjectDocument, next: CutProjectDocument) {
  const previousById = new Map(previous.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip] as const))
  const nextById = new Map(next.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip] as const))
  return [...new Set([...previousById.keys(), ...nextById.keys()])]
    .filter((id) => JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id)))
}

function changedTrackIds(previous: CutProjectDocument, next: CutProjectDocument) {
  const previousById = new Map(previous.tracks.map((track) => [track.id, track] as const))
  const nextById = new Map(next.tracks.map((track) => [track.id, track] as const))
  return [...new Set([...previousById.keys(), ...nextById.keys()])]
    .filter((id) => JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id)))
}
