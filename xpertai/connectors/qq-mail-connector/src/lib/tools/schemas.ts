import { z } from 'zod/v3'

const emailSchema = z.string().trim().email().max(320)
const boundedIdSchema = z.string().trim().min(1).max(512)
const cursorSchema = z.string().trim().min(1).max(4_096)
const isoDateSchema = z.string().datetime({ offset: true })

export const recipientSchema = z
  .object({
    email: emailSchema.describe('Recipient email address.'),
    name: z.string().trim().min(1).max(200).optional()
  })
  .strict()

const portableFileReferenceSchema = z
  .object({
    source: z.literal('platform.workspace.files'),
    filePath: z.string().trim().min(1).max(2_048),
    workspacePath: z.string().trim().min(1).max(2_048)
  })
  .passthrough()

export const workspaceFileSchema = z
  .object({
    path: z.string().trim().min(1).max(2_048).optional(),
    filePath: z.string().trim().min(1).max(2_048).optional(),
    workspacePath: z.string().trim().min(1).max(2_048).optional(),
    fileRef: portableFileReferenceSchema.optional(),
    name: z.string().trim().min(1).max(240).optional()
  })
  .strict()
  .refine((value) => !!(value.fileRef ?? value.workspacePath ?? value.filePath ?? value.path), {
    message: 'Provide fileRef, workspacePath, filePath, or path.'
  })

const accountSelector = {
  account_email: emailSchema.optional().describe('Connected QQ Mail alias to use. Omit to use the primary alias.')
}

const confirmationFields = {
  confirmation_handle: z
    .string()
    .uuid()
    .optional()
    .describe('Opaque handle returned by the first confirmation_required result.'),
  confirmed: z
    .literal(true)
    .optional()
    .describe('Set only after the user explicitly confirms through Xpert human input UI.')
}

const mutationSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({ ...shape, ...confirmationFields })
    .strict()
    .superRefine((value, context) => {
      const handle = Reflect.get(value, 'confirmation_handle')
      const confirmed = Reflect.get(value, 'confirmed')
      if ((handle && confirmed !== true) || (!handle && confirmed === true)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'confirmation_handle and confirmed=true must be provided together.'
        })
      }
    })

export const getAccountSchema = z.object({}).strict()

export const listMessagesSchema = z
  .object({
    ...accountSelector,
    dir: z.enum(['inbox', 'sent', 'trash', 'spam']).default('inbox'),
    limit: z.number().int().min(1).max(50).default(10),
    cursor: cursorSchema.optional(),
    after: isoDateSchema.optional(),
    before: isoDateSchema.optional(),
    has_attachments: z.boolean().optional(),
    is_read: z.boolean().optional()
  })
  .strict()
  .refine((value) => !value.after || !value.before || Date.parse(value.after) < Date.parse(value.before), {
    path: ['before'],
    message: 'before must be later than after.'
  })

export const getMessageSchema = z
  .object({
    ...accountSelector,
    message_id: boundedIdSchema
  })
  .strict()

export const searchMessagesSchema = z
  .object({
    ...accountSelector,
    q: z.string().trim().min(1).max(500).optional(),
    search_in: z.enum(['SEARCH_IN_ALL', 'SEARCH_IN_SUBJECT', 'SEARCH_IN_CONTENT']).default('SEARCH_IN_ALL'),
    from: emailSchema.optional(),
    to: emailSchema.optional(),
    dir: z.enum(['inbox', 'sent', 'trash', 'spam']).optional(),
    after: isoDateSchema.optional(),
    before: isoDateSchema.optional(),
    has_attachments: z.boolean().optional(),
    is_read: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(10),
    cursor: cursorSchema.optional()
  })
  .strict()
  .refine((value) => !value.after || !value.before || Date.parse(value.after) < Date.parse(value.before), {
    path: ['before'],
    message: 'before must be later than after.'
  })

export const listAttachmentsSchema = getMessageSchema

export const downloadAttachmentSchema = z
  .object({
    ...accountSelector,
    message_id: boundedIdSchema,
    attachment_id: boundedIdSchema,
    output_name: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^[^/\\\0]+$/)
      .optional()
  })
  .strict()

const messageBodyFields = {
  body: z.string().min(1).max(200_000),
  body_format: z.enum(['PLAIN', 'HTML']).default('PLAIN'),
  attachments: z.array(workspaceFileSchema).max(10).optional()
}

export const sendMessageSchema = mutationSchema({
  ...accountSelector,
  to: z.array(recipientSchema).min(1).max(50),
  cc: z.array(recipientSchema).max(50).optional(),
  bcc: z.array(recipientSchema).max(50).optional(),
  subject: z.string().max(998),
  ...messageBodyFields
})

export const replyMessageSchema = mutationSchema({
  ...accountSelector,
  message_id: boundedIdSchema,
  body: messageBodyFields.body,
  body_format: messageBodyFields.body_format,
  reply_all: z.boolean().default(false),
  cc: z.array(recipientSchema).max(50).optional(),
  bcc: z.array(recipientSchema).max(50).optional(),
  attachments: messageBodyFields.attachments
})

export const forwardMessageSchema = mutationSchema({
  ...accountSelector,
  message_id: boundedIdSchema,
  to: z.array(recipientSchema).min(1).max(50),
  cc: z.array(recipientSchema).max(50).optional(),
  bcc: z.array(recipientSchema).max(50).optional(),
  body: z.string().max(200_000).optional(),
  body_format: messageBodyFields.body_format,
  include_attachments: z.boolean().default(true),
  attachments: messageBodyFields.attachments
})

export type GetAccountInput = z.infer<typeof getAccountSchema>
export type ListMessagesInput = z.infer<typeof listMessagesSchema>
export type GetMessageInput = z.infer<typeof getMessageSchema>
export type SearchMessagesInput = z.infer<typeof searchMessagesSchema>
export type ListAttachmentsInput = z.infer<typeof listAttachmentsSchema>
export type DownloadAttachmentInput = z.infer<typeof downloadAttachmentSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type ReplyMessageInput = z.infer<typeof replyMessageSchema>
export type ForwardMessageInput = z.infer<typeof forwardMessageSchema>
export type WorkspaceFileInput = z.infer<typeof workspaceFileSchema>
