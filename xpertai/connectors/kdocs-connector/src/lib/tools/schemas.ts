import { z } from 'zod/v3'

const identifier = z.string().trim().min(1).max(256).refine(
  (value) => !['current', 'current_file', 'unknown'].includes(value.toLowerCase()),
  'Use an exact identifier returned by a WPS Docs tool.'
)
const pageToken = z.string().trim().min(1).max(1_024).optional()
const fileName = z.string().trim().min(1).max(240).refine((value) => !/[\\/\0]/.test(value), 'File name must not contain path separators.')
const officeFileName = fileName.refine(
  (value) => /\.(doc|docx|otl|dbt|xls|xlsx|ppt|pptx)$/i.test(value),
  'File name must use a WPS-supported office extension.'
)

const searchScope = z.enum([
  'all',
  'share_by_me',
  'share_to_me',
  'latest',
  'personal_drive',
  'group_drive',
  'recycle',
  'customize',
  'latest_opened',
  'latest_edited'
])

export const searchFilesSchema = z.object({
  keyword: z.string().trim().min(1).max(200).optional(),
  type: z.enum(['file_name', 'content', 'all']).default('all'),
  file_type: z.enum(['file', 'folder']).optional(),
  file_exts: z.array(z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/)).max(20).optional(),
  drive_ids: z.array(identifier).max(20).optional().describe(
    'Optional WPS drive IDs returned by a previous search or file metadata result.'
  ),
  parent_ids: z.array(identifier).max(20).optional(),
  scope: z.array(searchScope).max(10).refine(
    (values) => new Set(values).size === values.length,
    'Search scopes must be unique.'
  ).default(['all']).describe(
    'WPS search scopes. Defaults to all; use personal_drive to restrict results to 我的云文档.'
  ),
  page_size: z.number().int().min(1).max(100).default(20),
  page_token: pageToken,
  order: z.enum(['asc', 'desc']).default('desc'),
  order_by: z.enum(['ctime', 'mtime']).default('mtime')
}).strict()

export const listFilesSchema = z.object({
  drive_id: identifier,
  parent_id: identifier.default('0'),
  page_size: z.number().int().min(1).max(100).default(50),
  page_token: pageToken,
  order: z.enum(['asc', 'desc']).default('desc'),
  order_by: z.enum(['ctime', 'mtime', 'dtime', 'fname', 'fsize']).default('mtime'),
  filter_type: z.enum(['file', 'folder', 'shortcut']).optional(),
  filter_exts: z.string().trim().max(200).optional()
}).strict()

export const getFileSchema = z.object({ file_id: identifier }).strict()

export const readDocumentSchema = z.object({
  drive_id: identifier,
  file_id: identifier.optional(),
  link_id: identifier.optional(),
  format: z.enum(['markdown', 'plain']).default('markdown'),
  include_elements: z.array(z.enum(['para', 'table', 'component', 'textbox', 'all']))
    .min(1).max(5).refine((values) => new Set(values).size === values.length, 'Elements must be unique.')
    .default(['para', 'table']),
  task_id: identifier.optional()
}).strict().refine(
  (value) => Number(!!value.file_id) + Number(!!value.link_id) === 1,
  { message: 'Provide exactly one of file_id or link_id.', path: ['file_id'] }
)

const destination = {
  drive_id: identifier.optional(),
  parent_id: identifier.optional(),
  parent_path: z.array(z.string().trim().min(1).max(120)).max(20).optional()
}

export const createFileSchema = z.object({
  ...destination,
  name: officeFileName,
  on_name_conflict: z.enum(['fail', 'rename']).default('rename')
}).strict().refine(
  (value) => (!!value.drive_id && !!value.parent_id) || (!value.drive_id && !value.parent_id),
  { message: 'drive_id and parent_id must be provided together, or both may be omitted to use the provider default.', path: ['drive_id'] }
)

export const writeSmartDocumentSchema = z.object({
  file_id: identifier,
  title: z.string().trim().min(1).max(240).optional(),
  content: z.string().min(1).max(100_000),
  format: z.enum(['markdown', 'html']).default('markdown'),
  mode: z.enum(['prepend', 'append', 'replace']).default('append'),
  confirmed: z.boolean().optional()
}).strict().refine(
  (value) => value.mode !== 'replace' || value.confirmed === true,
  { message: 'Replacing all document content requires confirmed=true after user confirmation.', path: ['confirmed'] }
)

export const renameFileSchema = z.object({
  file_id: identifier,
  drive_id: identifier.optional(),
  new_name: fileName
}).strict()

export const moveFileSchema = z.object({
  file_id: identifier,
  drive_id: identifier,
  destination_drive_id: identifier,
  destination_parent_id: identifier
}).strict()

export const copyFileSchema = z.object({
  file_id: identifier,
  drive_id: identifier.optional(),
  destination_drive_id: identifier,
  destination_parent_id: identifier
}).strict()

export const getSheetsSchema = z.object({ file_id: identifier }).strict()

const sheetRange = z.object({
  row_from: z.number().int().min(0).max(1_048_575),
  row_to: z.number().int().min(0).max(1_048_575),
  col_from: z.number().int().min(0).max(16_383),
  col_to: z.number().int().min(0).max(16_383)
}).strict().refine(
  (value) => value.row_to >= value.row_from && value.col_to >= value.col_from,
  'Range end coordinates must not precede start coordinates.'
).refine(
  (value) => (value.row_to - value.row_from + 1) * (value.col_to - value.col_from + 1) <= 5_000,
  'A sheet read may contain at most 5,000 cells.'
)

export const readSheetRangeSchema = z.object({
  file_id: identifier,
  sheet_id: z.number().int().min(0),
  range: sheetRange
}).strict()

const sheetValue = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null()
])

export const updateSheetCellsSchema = z.object({
  file_id: identifier,
  sheet_id: z.number().int().min(0),
  cells: z.array(z.object({
    row: z.number().int().min(0).max(1_048_575),
    col: z.number().int().min(0).max(16_383),
    value: sheetValue
  }).strict()).min(1).max(100).refine(
    (cells) => new Set(cells.map((cell) => `${cell.row}:${cell.col}`)).size === cells.length,
    'Each cell coordinate may appear only once.'
  )
}).strict()

export const appendSheetRowSchema = z.object({
  file_id: identifier,
  sheet_id: z.number().int().min(0),
  values: z.array(sheetValue).min(1).max(100)
}).strict()

const portableFileReference = z.object({
  source: z.literal('platform.workspace.files'),
  filePath: z.string().min(1).max(1_024),
  workspacePath: z.string().min(1).max(1_024)
}).passthrough()

export const workspaceFileSchema = z.object({
  path: z.string().min(1).max(1_024).optional(),
  filePath: z.string().min(1).max(1_024).optional(),
  workspacePath: z.string().min(1).max(1_024).optional(),
  fileRef: portableFileReference.optional(),
  name: fileName.optional(),
  mimeType: z.string().trim().min(1).max(200).optional()
}).strict().refine(
  (value) => !!(value.fileRef || value.workspacePath || value.filePath || value.path),
  'Provide a Workspace Files reference or workspace path.'
)

export const uploadFileSchema = z.object({
  file: workspaceFileSchema,
  file_id: identifier.optional(),
  target_name: fileName.optional(),
  drive_id: identifier.optional(),
  parent_id: identifier.optional(),
  content_format: z.enum(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'markdown']).optional()
}).strict().refine(
  (value) => (!!value.drive_id && !!value.parent_id) || (!value.drive_id && !value.parent_id),
  { message: 'drive_id and parent_id must be provided together.', path: ['drive_id'] }
).refine(
  (value) => !value.file_id || !value.target_name,
  { message: 'target_name is for new uploads and cannot be combined with file_id.', path: ['target_name'] }
)

export const downloadFileSchema = z.object({
  file_id: identifier,
  drive_id: identifier.optional(),
  output_name: fileName.optional()
}).strict()

export type SearchFilesInput = z.infer<typeof searchFilesSchema>
export type ListFilesInput = z.infer<typeof listFilesSchema>
export type GetFileInput = z.infer<typeof getFileSchema>
export type ReadDocumentInput = z.infer<typeof readDocumentSchema>
export type CreateFileInput = z.infer<typeof createFileSchema>
export type WriteSmartDocumentInput = z.infer<typeof writeSmartDocumentSchema>
export type RenameFileInput = z.infer<typeof renameFileSchema>
export type MoveFileInput = z.infer<typeof moveFileSchema>
export type CopyFileInput = z.infer<typeof copyFileSchema>
export type GetSheetsInput = z.infer<typeof getSheetsSchema>
export type ReadSheetRangeInput = z.infer<typeof readSheetRangeSchema>
export type UpdateSheetCellsInput = z.infer<typeof updateSheetCellsSchema>
export type AppendSheetRowInput = z.infer<typeof appendSheetRowSchema>
export type UploadFileInput = z.infer<typeof uploadFileSchema>
export type DownloadFileInput = z.infer<typeof downloadFileSchema>
