import { z } from 'zod/v3'

const identifier = z
  .string()
  .trim()
  .regex(/^\d{1,32}$/, 'Use an exact numeric ID returned by a Knowledge Planet tool.')
const cursor = z.string().trim().min(1).max(100).optional().describe('Use nextCursor from the previous page unchanged.')
const confirmationFields = {
  confirmed: z.boolean().optional().describe('Set true only after the user approved the exact preview.'),
  confirmationHandle: z
    .string()
    .uuid()
    .optional()
    .describe('Single-use handle returned by the first call with the same arguments.')
}
const validConfirmationPair = (value: { confirmed?: boolean; confirmationHandle?: string }) =>
  (!value.confirmed && !value.confirmationHandle) || (value.confirmed === true && !!value.confirmationHandle)

export const emptySchema = z.object({}).strict()

export const listGroupsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    scope: z.enum(['normal', 'all']).default('normal')
  })
  .strict()

export const searchGroupsSchema = z
  .object({
    keyword: z.string().trim().min(1).max(100)
  })
  .strict()

export const groupIdSchema = z.object({ groupId: identifier }).strict()

export const listTopicsSchema = z
  .object({
    groupId: identifier,
    limit: z.number().int().min(1).max(30).default(20),
    cursor
  })
  .strict()

export const searchTopicsSchema = z
  .object({
    groupId: identifier,
    query: z.string().trim().min(1).max(200)
  })
  .strict()

export const topicIdSchema = z.object({ topicId: identifier }).strict()

export const listCommentsSchema = z
  .object({
    topicId: identifier,
    limit: z.number().int().min(1).max(30).default(20),
    cursor
  })
  .strict()

export const listNotesSchema = z
  .object({
    limit: z.number().int().min(1).max(30).default(20),
    cursor
  })
  .strict()

export const noteIdSchema = z.object({ noteId: identifier }).strict()

export const listFootprintsSchema = z
  .object({
    limit: z.number().int().min(1).max(30).default(20),
    cursor
  })
  .strict()

const workspaceScopeFields = {
  tenantId: z.string().min(1).max(200).nullable().optional(),
  organizationId: z.string().min(1).max(200).nullable().optional(),
  userId: z.string().min(1).max(200).nullable().optional(),
  catalog: z.enum(['projects', 'users', 'knowledges', 'skills', 'xperts']).nullable().optional(),
  scopeId: z.string().min(1).max(200).nullable().optional(),
  projectId: z.string().min(1).max(200).nullable().optional(),
  knowledgeId: z.string().min(1).max(200).nullable().optional(),
  rootId: z.string().min(1).max(200).nullable().optional(),
  xpertId: z.string().min(1).max(200).nullable().optional(),
  isolateByUser: z.boolean().nullable().optional()
}

const portableFileReference = z
  .object({
    ...workspaceScopeFields,
    source: z.literal('platform.workspace.files'),
    filePath: z.string().min(1).max(1_024),
    workspacePath: z.string().min(1).max(1_024),
    originalName: z.string().trim().min(1).max(240).nullable().optional(),
    name: z.string().trim().min(1).max(240).nullable().optional(),
    mimeType: z.string().trim().min(1).max(200).nullable().optional(),
    size: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024)
      .nullable()
      .optional()
  })
  .strict()

export const workspaceFileSchema = z
  .object({
    ...workspaceScopeFields,
    path: z.string().min(1).max(1_024).optional(),
    filePath: z.string().min(1).max(1_024).optional(),
    workspacePath: z.string().min(1).max(1_024).optional(),
    fileRef: portableFileReference.optional(),
    originalName: z.string().trim().min(1).max(240).optional(),
    name: z.string().trim().min(1).max(240).optional(),
    mimeType: z.string().trim().min(1).max(200).optional(),
    size: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024)
      .optional()
  })
  .strict()
  .refine(
    (value) => !!(value.fileRef || value.workspacePath || value.filePath || value.path),
    'Provide a Workspace Files reference or workspace path.'
  )
  .refine(isSafeWorkspaceFile, 'Workspace Files paths must stay inside the active workspace.')

const voteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    options: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine((value) => !value.includes(','), 'Vote options cannot contain commas.')
      )
      .min(2)
      .max(20)
      .refine((values) => new Set(values).size === values.length, 'Vote options must be unique.')
  })
  .strict()

export const createTopicSchema = z
  .object({
    groupId: identifier,
    text: z.string().trim().min(1).max(100_000).optional(),
    attachments: z.array(workspaceFileSchema).max(9).optional(),
    markdown: z.boolean().default(false),
    aiMode: z.enum(['aigc', 'personal_perspective', 'none']).default('none'),
    askUserId: identifier.optional(),
    anonymous: z.boolean().default(false),
    vote: voteSchema.optional(),
    checkinId: identifier.optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine((value) => !!(value.text || value.attachments?.length || value.vote), 'Provide text, attachments, or a vote.')
  .refine((value) => !value.anonymous || !!value.askUserId, {
    path: ['anonymous'],
    message: 'anonymous is valid only for a question.'
  })
  .refine((value) => !value.askUserId || (!!value.text && value.text.length <= 1_000), {
    path: ['text'],
    message: 'A question requires text no longer than 1,000 characters.'
  })
  .refine((value) => !value.askUserId || !value.attachments?.length, {
    path: ['attachments'],
    message: 'Question topics do not support attachments.'
  })
  .refine((value) => !value.askUserId || !value.vote, { path: ['vote'], message: 'A question cannot include a vote.' })
  .refine((value) => !value.askUserId || !value.checkinId, {
    path: ['checkinId'],
    message: 'A question cannot be linked to a check-in.'
  })

export const createCommentSchema = z
  .object({
    topicId: identifier,
    text: z.string().trim().min(1).max(10_000),
    replyToCommentId: identifier.optional(),
    attachment: workspaceFileSchema.optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })

export const answerQuestionSchema = z
  .object({
    topicId: identifier,
    text: z.string().trim().min(1).max(10_000),
    image: workspaceFileSchema.optional(),
    scheduledTime: z.string().trim().min(10).max(40).optional(),
    silenced: z.boolean().default(false),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine((value) => !value.scheduledTime || isWithinScheduleWindow(value.scheduledTime), {
    path: ['scheduledTime'],
    message: 'scheduledTime must be in the future and within 14 days.'
  })
  .refine((value) => !value.silenced || !!value.scheduledTime, {
    path: ['silenced'],
    message: 'silenced requires scheduledTime.'
  })

export const editTopicSchema = z
  .object({
    topicId: identifier,
    text: z.string().trim().min(1).max(100_000).optional(),
    attachments: z.array(workspaceFileSchema).max(9).optional(),
    clearFiles: z.boolean().default(false),
    aiMode: z.enum(['aigc', 'personal_perspective', 'none']).optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine(
    (value) => !!(value.text || value.attachments?.length || value.clearFiles || value.aiMode),
    'Provide text, attachments, clearFiles, or aiMode.'
  )
  .refine((value) => !value.clearFiles || !value.attachments?.length, {
    path: ['attachments'],
    message: 'attachments and clearFiles cannot be combined.'
  })

export const scheduleTopicSchema = z
  .object({
    groupId: identifier,
    text: z.string().trim().min(1).max(100_000).optional(),
    attachments: z.array(workspaceFileSchema).max(9).optional(),
    scheduledTime: z.string().trim().min(10).max(40),
    jobId: identifier.optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine((value) => isWithinScheduleWindow(value.scheduledTime), {
    path: ['scheduledTime'],
    message: 'scheduledTime must be in the future and within 14 days.'
  })
  .refine(
    (value) => !!value.jobId || !!value.text || !!value.attachments?.length,
    'A new scheduled topic requires text or attachments.'
  )

export const listScheduledTopicsSchema = z.object({ groupId: identifier }).strict()

export const unscheduleTopicSchema = z
  .object({
    groupId: identifier,
    jobId: identifier,
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })

export const searchMembersSchema = z
  .object({
    groupId: identifier,
    keyword: z.string().trim().min(1).max(100),
    limit: z.number().int().min(1).max(50).default(20)
  })
  .strict()

export const setTopicStateSchema = z
  .object({
    topicId: identifier,
    digested: z.boolean().optional(),
    sticky: z.boolean().optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine((value) => value.digested !== undefined || value.sticky !== undefined, 'Provide digested or sticky.')

export const setTopicTagsSchema = z
  .object({
    topicId: identifier,
    titles: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .refine((values) => new Set(values).size === values.length, 'Tag titles must be unique.'),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })

export const createNoteSchema = z
  .object({
    text: z.string().trim().min(1).max(100_000),
    images: z.array(workspaceFileSchema).max(9).optional(),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })

export const editNoteSchema = z
  .object({
    noteId: identifier,
    text: z.string().trim().min(1).max(100_000).optional(),
    images: z.array(workspaceFileSchema).max(9).optional(),
    clearImages: z.boolean().default(false),
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })
  .refine(
    (value) => !!(value.text || value.images?.length || value.clearImages),
    'Provide text, images, or clearImages=true.'
  )
  .refine((value) => !value.clearImages || !value.images?.length, {
    path: ['images'],
    message: 'images and clearImages cannot be combined.'
  })

export const deleteNoteSchema = z
  .object({
    noteId: identifier,
    ...confirmationFields
  })
  .strict()
  .refine(validConfirmationPair, {
    path: ['confirmationHandle'],
    message: 'confirmed=true and confirmationHandle must be provided together.'
  })

export type ListGroupsInput = z.infer<typeof listGroupsSchema>
export type SearchGroupsInput = z.infer<typeof searchGroupsSchema>
export type GroupIdInput = z.infer<typeof groupIdSchema>
export type ListTopicsInput = z.infer<typeof listTopicsSchema>
export type SearchTopicsInput = z.infer<typeof searchTopicsSchema>
export type TopicIdInput = z.infer<typeof topicIdSchema>
export type ListCommentsInput = z.infer<typeof listCommentsSchema>
export type ListNotesInput = z.infer<typeof listNotesSchema>
export type NoteIdInput = z.infer<typeof noteIdSchema>
export type ListFootprintsInput = z.infer<typeof listFootprintsSchema>
export type WorkspaceFileInput = z.infer<typeof workspaceFileSchema>
export type CreateTopicInput = z.infer<typeof createTopicSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>
export type EditTopicInput = z.infer<typeof editTopicSchema>
export type ScheduleTopicInput = z.infer<typeof scheduleTopicSchema>
export type ListScheduledTopicsInput = z.infer<typeof listScheduledTopicsSchema>
export type UnscheduleTopicInput = z.infer<typeof unscheduleTopicSchema>
export type SearchMembersInput = z.infer<typeof searchMembersSchema>
export type SetTopicStateInput = z.infer<typeof setTopicStateSchema>
export type SetTopicTagsInput = z.infer<typeof setTopicTagsSchema>
export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type EditNoteInput = z.infer<typeof editNoteSchema>
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>

type WorkspaceFileShape = {
  path?: string
  filePath?: string
  workspacePath?: string
  fileRef?: { filePath?: string; workspacePath?: string }
}

function isSafeWorkspaceFile(value: WorkspaceFileShape): boolean {
  const paths = [
    value.path,
    value.filePath,
    value.workspacePath,
    value.fileRef?.filePath,
    value.fileRef?.workspacePath
  ].filter((item): item is string => !!item)
  return paths.every(
    (item) => !item.includes('..') && !item.startsWith('~') && (!item.startsWith('/') || item.startsWith('/workspace/'))
  )
}

function isWithinScheduleWindow(value: string): boolean {
  const time = Date.parse(value)
  const now = Date.now()
  return Number.isFinite(time) && time > now && time <= now + 14 * 24 * 60 * 60 * 1000
}
