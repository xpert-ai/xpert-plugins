import { z } from 'zod/v3'

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine(
    (value) => !['current', 'current_file', 'unknown'].includes(value.toLowerCase()),
    'Use an exact identifier returned by a Baidu Netdisk tool.'
  )
const path = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith('/'), 'Path must be absolute and start with /.')
const page = z.number().int().min(1).max(100)
const pageSize = z.number().int().min(1).max(100)
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\\/\0]/.test(value), 'File name must not contain path separators.')

export const emptySchema = z.object({}).strict()

export const listFilesSchema = z
  .object({
    path,
    category: z.enum(['all', 'document', 'image', 'video']).default('all'),
    page: page.default(1),
    page_size: pageSize.default(20)
  })
  .strict()

export const getFileSchema = z
  .object({
    fsids: z.array(identifier).min(1).max(10)
  })
  .strict()

export const searchFilesSchema = z
  .object({
    keyword: z.string().trim().min(1).max(160),
    path: path.default('/'),
    page: page.default(1),
    page_size: pageSize.default(20)
  })
  .strict()

export const semanticSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    path: path.default('/'),
    search_type: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(2),
    category: z.number().int().min(1).max(7).optional(),
    page: z.literal(1).default(1),
    page_size: pageSize.default(20)
  })
  .strict()

export const createFolderSchema = z
  .object({
    path,
    on_conflict: z.enum(['fail', 'rename', 'overwrite']).default('rename')
  })
  .strict()

const fileMove = z
  .object({
    path,
    destination: path,
    new_name: fileName.optional()
  })
  .strict()

export const copyFilesSchema = z
  .object({
    files: z.array(fileMove).min(1).max(50),
    on_conflict: z.enum(['fail', 'rename', 'overwrite', 'skip']).default('rename')
  })
  .strict()

export const moveFilesSchema = copyFilesSchema

export const renameFileSchema = z
  .object({
    path,
    new_name: fileName,
    on_conflict: z.enum(['fail', 'rename', 'overwrite', 'skip']).default('rename')
  })
  .strict()

export const deleteFilesSchema = z
  .object({
    paths: z.array(path).min(1).max(50),
    confirmed: z.literal(true)
  })
  .strict()

const portableFileReference = z
  .object({
    source: z.literal('platform.workspace.files'),
    filePath: z.string().trim().min(1).max(1_024),
    workspacePath: z.string().trim().min(1).max(1_024)
  })
  .passthrough()

const workspaceFileDescriptor = z
  .object({
    path: z.string().trim().min(1).max(1_024).optional(),
    filePath: z.string().trim().min(1).max(1_024).optional(),
    workspacePath: z.string().trim().min(1).max(1_024).optional(),
    fileRef: portableFileReference.optional(),
    originalName: z.string().trim().min(1).max(256).optional(),
    name: z.string().trim().min(1).max(256).optional(),
    mimeType: z.string().trim().min(1).max(256).optional(),
    size: z.number().int().positive().optional()
  })
  .passthrough()
  .refine(
    (value) => Boolean(value.path || value.filePath || value.workspacePath || value.fileRef),
    'Provide a workspace file path or fileRef.'
  )

export const uploadWorkspaceFileSchema = z
  .object({
    file: z.union([z.string().trim().min(1).max(1_024), workspaceFileDescriptor]),
    destination_dir: path.optional(),
    file_name: fileName.optional(),
    on_conflict: z.enum(['fail', 'rename', 'overwrite']).default('fail')
  })
  .strict()

export const uploadTextSchema = z
  .object({
    content: z.string().min(1).max(20_000),
    destination_dir: path.optional(),
    file_name: fileName,
    on_conflict: z.enum(['fail', 'rename', 'overwrite']).default('fail')
  })
  .strict()

export type ListFilesInput = z.infer<typeof listFilesSchema>
export type GetFileInput = z.infer<typeof getFileSchema>
export type SearchFilesInput = z.infer<typeof searchFilesSchema>
export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>
export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type CopyFilesInput = z.infer<typeof copyFilesSchema>
export type MoveFilesInput = z.infer<typeof moveFilesSchema>
export type RenameFileInput = z.infer<typeof renameFileSchema>
export type DeleteFilesInput = z.infer<typeof deleteFilesSchema>
export type UploadWorkspaceFileInput = z.infer<typeof uploadWorkspaceFileSchema>
export type UploadTextInput = z.infer<typeof uploadTextSchema>
