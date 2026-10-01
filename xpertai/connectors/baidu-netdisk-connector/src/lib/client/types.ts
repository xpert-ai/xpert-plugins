export type BaiduNetdiskRuntimeCredential = {
  connectorId: string
  integrationId?: string
  accessToken: string
  tokenType: string
}

export type BaiduNetdiskOAuthToken = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn?: number
  tokenType: string
  userId?: string
}

export type BaiduNetdiskFile = {
  fsid: string
  path: string
  name: string
  category: number
  isDirectory: boolean
  size?: number
  md5?: string
  modifiedAt?: string
  createdAt?: string
  content?: string
  abstract?: string
  thumbnail?: string
}

export type BaiduNetdiskPage = {
  page: number
  pageSize: number
  items: BaiduNetdiskFile[]
  hasMore: boolean
  total?: number
}

export type BaiduNetdiskQuota = {
  usedBytes: number
  totalBytes: number
  freeBytes: number
  expired?: boolean
}

export type BaiduNetdiskUser = {
  userId?: string
  name?: string
  avatarUrl?: string
}

export type BaiduNetdiskOperationResult = {
  status: 'completed' | 'queued'
  taskId?: string
  affectedFiles?: string[]
}

export type BaiduNetdiskUploadResult = {
  status: 'completed'
  path: string
  size: number
  rapidUpload: boolean
  fsid?: string
  md5?: string
}

export type BaiduNetdiskCall = {
  accessToken: string
  operation: BaiduNetdiskOperation
  arguments: Record<string, string | number | boolean | undefined>
}

export type BaiduNetdiskOperation =
  | 'quota'
  | 'userInfo'
  | 'list'
  | 'docList'
  | 'imageList'
  | 'videoList'
  | 'fileMeta'
  | 'search'
  | 'semanticSearch'
  | 'mkdir'
  | 'copy'
  | 'move'
  | 'rename'
  | 'delete'
