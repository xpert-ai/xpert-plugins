import { z } from 'zod/v3'
import {
  WECOM_MAX_RECIPIENTS,
  WECOM_MAX_RESULT_ITEMS,
  WECOM_MAX_TEXT_BYTES
} from '../constants.js'

const boundedString = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max)
const workspacePathSchema = z.string().trim().min(1).max(2_048)
const userIdSchema = boundedString('WeCom user ID', 64)
const recipientSchema = z
  .array(userIdSchema)
  .min(1)
  .max(WECOM_MAX_RECIPIENTS)
  .superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Recipient user IDs must be unique' })
    }
  })

const contentSchema = z
  .string()
  .min(1)
  .max(WECOM_MAX_TEXT_BYTES)
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(value, 'utf8') > WECOM_MAX_TEXT_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Content must not exceed ${WECOM_MAX_TEXT_BYTES} UTF-8 bytes` })
    }
  })

const confirmationFields = {
  confirmation_handle: z.string().uuid().optional(),
  confirmed: z.literal(true).optional()
}

function requireCompleteConfirmation<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({ ...shape, ...confirmationFields })
    .strict()
    .superRefine((value, ctx) => {
      if (!!value.confirmation_handle !== !!value.confirmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'confirmation_handle and confirmed=true must be provided together'
        })
      }
    })
}

export const getContextSchema = z.object({}).strict()
export const listDepartmentsSchema = z
  .object({
    parent_department_id: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(WECOM_MAX_RESULT_ITEMS).default(50)
  })
  .strict()
export const getDepartmentSchema = z.object({ department_id: z.number().int().positive() }).strict()
export const listDepartmentMembersSchema = z
  .object({
    department_id: z.number().int().positive(),
    limit: z.number().int().min(1).max(WECOM_MAX_RESULT_ITEMS).default(50)
  })
  .strict()
export const getMemberSchema = z.object({ user_id: userIdSchema }).strict()
export const listTagsSchema = z
  .object({ limit: z.number().int().min(1).max(WECOM_MAX_RESULT_ITEMS).default(50) })
  .strict()
export const getTagMembersSchema = z
  .object({
    tag_id: z.number().int().positive(),
    limit: z.number().int().min(1).max(WECOM_MAX_RESULT_ITEMS).default(50)
  })
  .strict()

export const sendTextMessageSchema = requireCompleteConfirmation({
  to_user_ids: recipientSchema,
  content: contentSchema
})
export const sendMarkdownMessageSchema = requireCompleteConfirmation({
  to_user_ids: recipientSchema,
  content: contentSchema
})

const portableFileReferenceSchema = z
  .object({
    source: z.literal('platform.workspace.files'),
    filePath: workspacePathSchema.optional(),
    workspacePath: workspacePathSchema.optional()
  })
  .passthrough()

export const workspaceFileSchema = z
  .object({
    path: workspacePathSchema.optional(),
    filePath: workspacePathSchema.optional(),
    workspacePath: workspacePathSchema.optional(),
    fileRef: portableFileReferenceSchema.optional(),
    originalName: z.string().min(1).max(240).optional(),
    name: z.string().min(1).max(240).optional(),
    mimeType: z.string().min(1).max(200).optional(),
    size: z.number().int().positive().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.path && !value.filePath && !value.workspacePath && !value.fileRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A Workspace Files path or fileRef is required' })
    }
  })

export const sendFileMessageSchema = requireCompleteConfirmation({
  to_user_ids: recipientSchema,
  file: workspaceFileSchema
})
export const recallMessageSchema = requireCompleteConfirmation({
  message_id: boundedString('WeCom message ID', 128)
})

export type GetContextInput = z.infer<typeof getContextSchema>
export type ListDepartmentsInput = z.infer<typeof listDepartmentsSchema>
export type GetDepartmentInput = z.infer<typeof getDepartmentSchema>
export type ListDepartmentMembersInput = z.infer<typeof listDepartmentMembersSchema>
export type GetMemberInput = z.infer<typeof getMemberSchema>
export type ListTagsInput = z.infer<typeof listTagsSchema>
export type GetTagMembersInput = z.infer<typeof getTagMembersSchema>
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>
export type SendMarkdownMessageInput = z.infer<typeof sendMarkdownMessageSchema>
export type SendFileMessageInput = z.infer<typeof sendFileMessageSchema>
export type RecallMessageInput = z.infer<typeof recallMessageSchema>
export type WorkspaceFileInput = z.infer<typeof workspaceFileSchema>
