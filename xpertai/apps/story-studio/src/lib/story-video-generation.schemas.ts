import { z } from 'zod/v3'
import { STORY_VIDEO_GENERATION_STATUSES } from './story-video-generation.types.js'

const bounded = (max: number) => z.string().trim().min(1).max(max)
const projectId = z.string().uuid()
const taskId = z.string().uuid()
const operationId = bounded(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
const changeSummary = bounded(240)
const shotIdentifier = bounded(160)

export const generateStoryShotTakesSchema = z.object({
  projectId,
  operationId,
  sceneId: shotIdentifier,
  shotId: shotIdentifier,
  toolsetId: z.string().uuid(),
  takeCount: z.number().int().min(1).max(4),
  prompt: z.string().trim().max(500),
  model: bounded(200),
  resolution: bounded(40),
  aspectRatio: bounded(20),
  fps: z.number().int().min(1).max(120),
  referenceAssetIds: z.array(z.string().trim().min(1).max(120)).max(9).optional(),
  referenceImageCandidateIds: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  durationSeconds: z.number().int().min(2).max(30),
  generateAudio: z.boolean().optional(),
  redoScope: z.enum(['performance', 'camera', 'lighting']).optional()
}).strict()

export const setStoryVideoGeneratorSchema = z.object({
  projectId,
  toolsetId: z.string().uuid()
}).strict()

export const listStoryVideoTasksSchema = z.object({
  projectId,
  sceneId: shotIdentifier.optional(),
  shotId: shotIdentifier.optional(),
  statuses: z.array(z.enum(STORY_VIDEO_GENERATION_STATUSES)).max(9).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
}).strict()

export const getStoryVideoTaskSchema = z.object({ projectId, taskId }).strict()

export const manageStoryVideoTaskSchema = z.object({
  projectId,
  taskId,
  operationId,
  changeSummary
}).strict()

export const selectStoryShotVideoSchema = z.object({
  projectId,
  sceneId: shotIdentifier,
  shotId: shotIdentifier,
  candidateId: shotIdentifier,
  operationId,
  changeSummary
}).strict()
