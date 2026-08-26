import { z } from 'zod/v3'
import {
  NETEASE_MAIL_DEFAULT_SEARCH_LIMIT,
  NETEASE_MAIL_MAX_ATTACHMENT_COUNT,
  NETEASE_MAIL_MAX_FOLDER_COUNT,
  NETEASE_MAIL_MAX_SEARCH_LIMIT
} from './constants.js'

const emailAddressSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase())
const operationIdSchema = z.string().uuid().describe('A new UUID generated for this single external send operation.')
const messageRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .describe('Opaque reference returned by a mail search or get tool.')
const mailBodyFields = {
  text: z.string().max(100_000).optional().describe('Plain-text email body.'),
  html: z.string().max(200_000).optional().describe('Optional HTML email body. Remote resources are not fetched.')
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

const portableFileReferenceSchema = z
  .object({
    source: z.literal('platform.workspace.files').optional(),
    filePath: z.string().trim().min(1).max(1_024).optional(),
    workspacePath: z.string().trim().min(1).max(1_024).optional()
  })
  .passthrough()

export const mailFileDescriptorSchema = z
  .object({
    path: z.string().trim().min(1).max(1_024).optional(),
    filePath: z.string().trim().min(1).max(1_024).optional(),
    workspacePath: z.string().trim().min(1).max(1_024).optional(),
    fileRef: portableFileReferenceSchema.optional(),
    originalName: z.string().trim().min(1).max(180).optional(),
    name: z.string().trim().min(1).max(180).optional(),
    mimeType: z.string().trim().min(1).max(160).optional(),
    size: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024)
      .optional()
  })
  .strict()
  .refine(
    (value) =>
      !!(
        value.path ||
        value.filePath ||
        value.workspacePath ||
        value.fileRef?.workspacePath ||
        value.fileRef?.filePath
      ),
    { message: 'A workspace file path or platform file reference is required.' }
  )

export const listMailFoldersSchema = z
  .object({
    limit: z.number().int().min(1).max(NETEASE_MAIL_MAX_FOLDER_COUNT).default(100)
  })
  .strict()

export const searchEmailsSchema = z
  .object({
    folder: z.string().trim().min(1).max(512).default('INBOX'),
    from: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .optional()
      .describe('Only the intended sender display name or email address. Matched as a case-insensitive substring.'),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe('Only the intended email subject text. Matched as a case-insensitive substring.'),
    since: z.string().datetime({ offset: true }).optional(),
    before: z.string().datetime({ offset: true }).optional(),
    unreadOnly: z.boolean().default(false),
    cursor: z.string().trim().min(1).max(1_024).optional(),
    limit: z.number().int().min(1).max(NETEASE_MAIL_MAX_SEARCH_LIMIT).default(NETEASE_MAIL_DEFAULT_SEARCH_LIMIT)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.since && value.before) {
      const since = new Date(value.since)
      const before = new Date(value.before)
      if (before <= since) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['before'], message: 'before must be after since.' })
      }
      if (before.getTime() - since.getTime() > 366 * 24 * 60 * 60 * 1_000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['before'],
          message: 'The search date range cannot exceed 366 days.'
        })
      }
    }
  })

export const getEmailSchema = z.object({ messageRef: messageRefSchema }).strict()

export const downloadEmailAttachmentSchema = z
  .object({
    messageRef: messageRefSchema,
    attachmentId: z
      .string()
      .regex(/^\d+(?:\.\d+)*$/)
      .max(80)
      .describe('MIME attachment identifier returned by get_netease_email.')
  })
  .strict()

const recipientFields = {
  to: z.array(emailAddressSchema).min(1).max(20),
  cc: z.array(emailAddressSchema).max(20).optional(),
  bcc: z.array(emailAddressSchema).max(20).optional()
}

export const sendEmailSchema = z
  .object({
    operationId: operationIdSchema,
    ...recipientFields,
    subject: z.string().trim().min(1).max(300),
    ...mailBodyFields,
    attachments: z.array(mailFileDescriptorSchema).max(NETEASE_MAIL_MAX_ATTACHMENT_COUNT).optional(),
    ...confirmationFields
  })
  .strict()
  .superRefine((value, context) => {
    validateSendInput(value, context)
    validateUniqueRecipients(value, context)
    validateConfirmationInput(value, context)
  })

export const replyEmailSchema = z
  .object({
    operationId: operationIdSchema,
    messageRef: messageRefSchema,
    replyAll: z.boolean().default(false),
    ...mailBodyFields,
    attachments: z.array(mailFileDescriptorSchema).max(NETEASE_MAIL_MAX_ATTACHMENT_COUNT).optional(),
    ...confirmationFields
  })
  .strict()
  .superRefine((value, context) => {
    validateSendInput(value, context)
    validateConfirmationInput(value, context)
  })

export const setEmailFlagsSchema = z
  .object({
    messageRef: messageRefSchema,
    read: z.boolean().optional(),
    starred: z.boolean().optional()
  })
  .strict()
  .refine((value) => value.read !== undefined || value.starred !== undefined, {
    message: 'At least one of read or starred must be provided.'
  })

export type MailFileDescriptorInput = z.infer<typeof mailFileDescriptorSchema>
export type ListMailFoldersToolInput = z.infer<typeof listMailFoldersSchema>
export type SearchEmailsToolInput = z.infer<typeof searchEmailsSchema>
export type GetEmailToolInput = z.infer<typeof getEmailSchema>
export type DownloadEmailAttachmentToolInput = z.infer<typeof downloadEmailAttachmentSchema>
export type SendEmailToolInput = z.infer<typeof sendEmailSchema>
export type ReplyEmailToolInput = z.infer<typeof replyEmailSchema>
export type SetEmailFlagsToolInput = z.infer<typeof setEmailFlagsSchema>

function validateSendInput(
  value: { text?: string; html?: string; attachments?: MailFileDescriptorInput[] },
  context: z.RefinementCtx
): void {
  if (!value.text?.trim() && !value.html?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['text'],
      message: 'At least one non-empty text or html body is required.'
    })
  }
}

function validateConfirmationInput(
  value: { confirmation_handle?: string; confirmed?: true },
  context: z.RefinementCtx
): void {
  if (
    (value.confirmation_handle && value.confirmed !== true) ||
    (!value.confirmation_handle && value.confirmed === true)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'confirmation_handle and confirmed=true must be provided together.'
    })
  }
}

function validateUniqueRecipients(
  value: { to?: string[]; cc?: string[]; bcc?: string[] },
  context: z.RefinementCtx
): void {
  const recipients = [...(value.to ?? []), ...(value.cc ?? []), ...(value.bcc ?? [])]
  if (new Set(recipients.map((recipient) => recipient.toLowerCase())).size !== recipients.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'Recipients must be unique across to, cc, and bcc.'
    })
  }
}
