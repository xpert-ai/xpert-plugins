import { z } from 'zod/v3'

const departmentIdSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER)
  .describe('DingTalk department ID returned by dingtalk_list_departments.')
const cursorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const languageSchema = z.enum(['zh_CN', 'en_US']).default('zh_CN')
const boundedIdSchema = z.string().trim().min(1).max(256)

const confirmationFields = {
  confirmation_handle: z
    .string()
    .uuid()
    .optional()
    .describe('Opaque handle returned by the first confirmation_required result.'),
  confirmed: z.literal(true).optional().describe('Set only after the user explicitly confirms the exact message.')
}

export const getAccountSchema = z.object({}).strict()

export const listDepartmentsSchema = z
  .object({
    parent_department_id: departmentIdSchema.default(1),
    language: languageSchema
  })
  .strict()

export const listDepartmentMembersSchema = z
  .object({
    department_id: departmentIdSchema,
    cursor: cursorSchema.default(0),
    limit: z.number().int().min(1).max(50).default(20),
    language: languageSchema
  })
  .strict()

export const getUserSchema = z
  .object({
    user_id: boundedIdSchema.describe('DingTalk user ID returned by dingtalk_list_department_members.'),
    language: languageSchema
  })
  .strict()

export const listConversationsSchema = z
  .object({
    cursor: cursorSchema.default(0),
    limit: z.number().int().min(1).max(50).default(20)
  })
  .strict()

export const sendMessageSchema = z
  .object({
    recipient_type: z.enum(['user_id', 'open_conversation_id']),
    recipient_id: boundedIdSchema.describe(
      'Exact DingTalk user ID or openConversationId returned by a DingTalk connector read tool.'
    ),
    format: z.enum(['text', 'markdown']).default('text'),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(5_000),
    ...confirmationFields
  })
  .strict()
  .superRefine((value, context) => {
    if (value.format === 'markdown' && !value.title) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'title is required when format is markdown.'
      })
    }
    if (
      (value.confirmation_handle && value.confirmed !== true) ||
      (!value.confirmation_handle && value.confirmed === true)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'confirmation_handle and confirmed=true must be provided together.'
      })
    }
  })

export type GetAccountInput = z.infer<typeof getAccountSchema>
export type ListDepartmentsInput = z.infer<typeof listDepartmentsSchema>
export type ListDepartmentMembersInput = z.infer<typeof listDepartmentMembersSchema>
export type GetUserInput = z.infer<typeof getUserSchema>
export type ListConversationsInput = z.infer<typeof listConversationsSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
