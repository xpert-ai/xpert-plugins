import { z } from 'zod/v3'
import { contentIdSchema, revisionSchema } from './contracts.js'

export const EDIT_FILE_TOOL = 'dockyard_edit_file'
export const editFileSchema = z.object({
  contentId: contentIdSchema.describe('Exact file path from the Help me edit reference.'),
  expectedRevision: revisionSchema.describe('Saved buffers revision from the reference label; never guess or increment on failure.'),
  oldText: z.string().min(1).max(200000).describe('Exact referenced text to replace. Must occur exactly once.'),
  newText: z.string().max(200000).describe('Replacement text. Empty text deletes the matched passage.')
}).strict()
export type EditFileInput = z.infer<typeof editFileSchema>
