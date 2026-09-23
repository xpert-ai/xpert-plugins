import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  BAIDU_NETDISK_API_ORIGIN,
  BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
  BAIDU_NETDISK_DEFAULT_TIMEOUT_MS,
  BAIDU_NETDISK_SEMANTIC_SEARCH_PATH,
  BAIDU_NETDISK_UPLOAD_CHUNK_BYTES,
  BAIDU_NETDISK_UPLOAD_ORIGIN
} from '../constants.js'
import { BaiduNetdiskConnectorError, errorMessage, readString } from '../errors.js'
import type { BaiduNetdiskOAuthConfig } from '../plugin-config.js'
import { readBoundedJsonObject } from '../services/bounded-json-response.js'
import { mapFile, mapOperation, mapPage, mapQuota, mapSemanticPage, mapUser } from './baidu-netdisk-mapper.js'
import type {
  BaiduNetdiskCall,
  BaiduNetdiskFile,
  BaiduNetdiskOperationResult,
  BaiduNetdiskPage,
  BaiduNetdiskQuota,
  BaiduNetdiskRuntimeCredential,
  BaiduNetdiskUploadResult,
  BaiduNetdiskUser
} from './types.js'

type JsonObject = Record<string, unknown>
type QueryValue = string | number | boolean | undefined

@Injectable()
export class BaiduNetdiskClient {
  async getQuota(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig
  ): Promise<BaiduNetdiskQuota> {
    return mapQuota(await this.call(credential, config, 'quota', { checkfree: 1, checkexpire: 1 }))
  }

  async getUserInfo(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig
  ): Promise<BaiduNetdiskUser> {
    return mapUser(await this.call(credential, config, 'userInfo', {}))
  }

  async listFiles(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    input: { path: string; page: number; pageSize: number; category?: 'all' | 'document' | 'image' | 'video' }
  ): Promise<BaiduNetdiskPage> {
    const operation =
      input.category === 'document'
        ? 'docList'
        : input.category === 'image'
        ? 'imageList'
        : input.category === 'video'
        ? 'videoList'
        : 'list'
    const args =
      operation === 'list'
        ? {
            dir: input.path,
            start: (input.page - 1) * input.pageSize,
            limit: input.pageSize,
            order: 'time',
            desc: 1,
            web: 1,
            folder: 0
          }
        : {
            parent_path: input.path,
            recursion: 0,
            page: input.page,
            num: input.pageSize,
            order: 'time',
            desc: 1,
            web: 1
          }
    return mapPage(await this.call(credential, config, operation, args), input.page, input.pageSize)
  }

  async getFile(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    fsids: string[]
  ): Promise<BaiduNetdiskFile[]> {
    const payload = await this.call(credential, config, 'fileMeta', {
      fsids: JSON.stringify(fsids),
      dlink: 0,
      thumb: 0
    })
    const source = Array.isArray(payload.list) ? payload.list : []
    return source.map(mapFile).filter((value): value is BaiduNetdiskFile => Boolean(value))
  }

  async searchFiles(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    input: { keyword: string; path: string; page: number; pageSize: number }
  ): Promise<BaiduNetdiskPage> {
    return mapPage(
      await this.call(credential, config, 'search', {
        key: input.keyword,
        dir: input.path,
        page: input.page,
        num: input.pageSize,
        recursion: 1,
        web: 1
      }),
      input.page,
      input.pageSize
    )
  }

  async semanticSearch(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    input: { query: string; path: string; page: number; pageSize: number; searchType: 0 | 1 | 2; category?: number }
  ): Promise<BaiduNetdiskPage> {
    const user = await this.getUserInfo(credential, config)
    const userId = user.userId && /^\d+$/.test(user.userId) ? user.userId : undefined
    const payload = await this.request(
      credential,
      config,
      BAIDU_NETDISK_SEMANTIC_SEARCH_PATH,
      'POST',
      {
        scene: 'mcpserver',
        query: input.query,
        ...(userId ? { dirs: JSON.stringify([{ uk: Number(userId), path: input.path }]) } : {}),
        search_type: input.searchType,
        ...(input.category !== undefined ? { category: JSON.stringify([input.category]) } : {}),
        num: input.pageSize
      },
      'jsonQuery'
    )
    return mapSemanticPage(payload, input.page, input.pageSize)
  }

  async mkdir(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    path: string,
    rtype: number
  ): Promise<BaiduNetdiskOperationResult> {
    return mapOperation(await this.call(credential, config, 'mkdir', { path, isdir: 1, rtype }), [path])
  }

  async fileManager(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    operation: 'copy' | 'move' | 'rename' | 'delete',
    fileList: string,
    ondup: string
  ): Promise<BaiduNetdiskOperationResult> {
    return mapOperation(await this.call(credential, config, operation, { filelist: fileList, ondup, async: 1 }))
  }

  async uploadBuffer(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    input: { path: string; buffer: Buffer; rtype: number }
  ): Promise<BaiduNetdiskUploadResult> {
    if (!input.buffer.length)
      throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', 'Baidu Netdisk cannot upload an empty file.')
    const chunks = splitBuffer(input.buffer, BAIDU_NETDISK_UPLOAD_CHUNK_BYTES)
    const blockList = chunks.map((chunk) => createHash('md5').update(chunk).digest('hex'))
    const precreate = await this.request(credential, config, '/rest/2.0/xpan/file?method=precreate', 'POST', {
      path: input.path,
      size: input.buffer.length,
      isdir: 0,
      autoinit: 1,
      block_list: JSON.stringify(blockList),
      rtype: input.rtype
    })
    if (readInteger(precreate.return_type) === 2) {
      return { status: 'completed', path: input.path, size: input.buffer.length, rapidUpload: true }
    }
    const uploadId = readString(precreate.uploadid)
    if (!uploadId)
      throw new BaiduNetdiskConnectorError(
        'UPSTREAM_RESPONSE_INVALID',
        'Baidu Netdisk precreate response did not include uploadid.'
      )
    const requiredParts = readIntegerList(precreate.block_list) ?? chunks.map((_, index) => index)
    const uploadedMd5 = new Map<number, string>()
    for (const part of requiredParts) {
      const chunk = chunks[part]
      if (!chunk)
        throw new BaiduNetdiskConnectorError(
          'UPSTREAM_RESPONSE_INVALID',
          'Baidu Netdisk requested an invalid upload part.'
        )
      uploadedMd5.set(part, await this.uploadPart(credential, config, input.path, uploadId, part, chunk))
    }
    const finalBlocks = blockList.map((md5, index) => uploadedMd5.get(index) ?? md5)
    const created = await this.request(credential, config, '/rest/2.0/xpan/file?method=create', 'POST', {
      path: input.path,
      size: input.buffer.length,
      isdir: 0,
      uploadid: uploadId,
      block_list: JSON.stringify(finalBlocks),
      rtype: input.rtype
    })
    return {
      status: 'completed',
      path: readString(created.path) ?? input.path,
      size: readInteger(created.size) ?? input.buffer.length,
      rapidUpload: false,
      ...(readIdentifier(created.fs_id) ? { fsid: readIdentifier(created.fs_id) } : {}),
      ...(readString(created.md5) ? { md5: readString(created.md5) } : {})
    }
  }

  async call(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    operation: BaiduNetdiskCall['operation'],
    args: Record<string, QueryValue>
  ): Promise<JsonObject> {
    const endpoint = operationPath(operation)
    const method = operation === 'mkdir' || ['copy', 'move', 'rename', 'delete'].includes(operation) ? 'POST' : 'GET'
    return this.request(credential, config, endpoint, method, args)
  }

  private async request(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    path: string,
    method: 'GET' | 'POST',
    args: Record<string, QueryValue>,
    bodyMode: 'form' | 'jsonQuery' = 'form'
  ): Promise<JsonObject> {
    const url = new URL(path, config.apiBaseUrl || BAIDU_NETDISK_API_ORIGIN)
    url.searchParams.set('access_token', credential.accessToken)
    url.searchParams.set('openapi', 'xpansdk')
    const form = new URLSearchParams()
    for (const [name, value] of Object.entries(args)) {
      if (value !== undefined) {
        if (method === 'GET' || bodyMode === 'jsonQuery') url.searchParams.set(name, String(value))
        else form.set(name, String(value))
      }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? BAIDU_NETDISK_DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Xpert-Baidu-Netdisk-Connector/0.1.0',
          ...(method === 'POST'
            ? {
                'Content-Type':
                  bodyMode === 'jsonQuery' ? 'application/json' : 'application/x-www-form-urlencoded; charset=UTF-8'
              }
            : {})
        },
        ...(method === 'POST' ? { body: bodyMode === 'jsonQuery' ? '{}' : form.toString() } : {}),
        redirect: 'error',
        signal: controller.signal
      })
      const payload = await readBoundedJsonObject(
        response,
        config.responseMaxBytes ?? BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
        'Baidu Netdisk'
      )
      if (!response.ok) throw httpError(response.status)
      assertBaiduSuccess(payload)
      return payload
    } catch (error) {
      if (error instanceof BaiduNetdiskConnectorError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BaiduNetdiskConnectorError('UPSTREAM_TIMEOUT', 'Baidu Netdisk request timed out.', true)
      }
      throw new BaiduNetdiskConnectorError(
        'UPSTREAM_UNAVAILABLE',
        `Baidu Netdisk request failed: ${errorMessage(error)}`,
        true
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private async uploadPart(
    credential: BaiduNetdiskRuntimeCredential,
    config: BaiduNetdiskOAuthConfig,
    path: string,
    uploadId: string,
    part: number,
    chunk: Buffer
  ): Promise<string> {
    const url = new URL('/rest/2.0/pcs/superfile2', config.uploadBaseUrl || BAIDU_NETDISK_UPLOAD_ORIGIN)
    url.searchParams.set('method', 'upload')
    url.searchParams.set('openapi', 'xpansdk')
    url.searchParams.set('access_token', credential.accessToken)
    url.searchParams.set('type', 'tmpfile')
    url.searchParams.set('path', path)
    url.searchParams.set('uploadid', uploadId)
    url.searchParams.set('partseq', String(part))
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(chunk)]), 'file')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? BAIDU_NETDISK_DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, { method: 'POST', body: form, redirect: 'error', signal: controller.signal })
      const payload = await readBoundedJsonObject(
        response,
        config.responseMaxBytes ?? BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
        'Baidu Netdisk upload'
      )
      if (!response.ok) throw httpError(response.status)
      assertBaiduSuccess(payload)
      const md5 = readString(payload.md5)
      if (!md5)
        throw new BaiduNetdiskConnectorError(
          'UPSTREAM_RESPONSE_INVALID',
          'Baidu Netdisk upload response did not include a part MD5.'
        )
      return md5
    } catch (error) {
      if (error instanceof BaiduNetdiskConnectorError) throw error
      if (error instanceof Error && error.name === 'AbortError')
        throw new BaiduNetdiskConnectorError('UPSTREAM_TIMEOUT', 'Baidu Netdisk upload timed out.', true)
      throw new BaiduNetdiskConnectorError(
        'UPSTREAM_UNAVAILABLE',
        `Baidu Netdisk upload failed: ${errorMessage(error)}`,
        true
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

function operationPath(operation: BaiduNetdiskCall['operation']): string {
  switch (operation) {
    case 'quota':
      return '/api/quota'
    case 'userInfo':
      return '/rest/2.0/xpan/nas?method=uinfo'
    case 'list':
      return '/rest/2.0/xpan/file?method=list'
    case 'docList':
      return '/rest/2.0/xpan/file?method=doclist'
    case 'imageList':
      return '/rest/2.0/xpan/file?method=imagelist'
    case 'videoList':
      return '/rest/2.0/xpan/file?method=videolist'
    case 'fileMeta':
      return '/rest/2.0/xpan/multimedia?method=filemetas'
    case 'search':
      return '/rest/2.0/xpan/file?method=search'
    case 'mkdir':
      return '/rest/2.0/xpan/file?method=create'
    case 'copy':
      return '/rest/2.0/xpan/file?method=filemanager&opera=copy'
    case 'move':
      return '/rest/2.0/xpan/file?method=filemanager&opera=move'
    case 'rename':
      return '/rest/2.0/xpan/file?method=filemanager&opera=rename'
    case 'delete':
      return '/rest/2.0/xpan/file?method=filemanager&opera=delete'
    case 'semanticSearch':
      return BAIDU_NETDISK_SEMANTIC_SEARCH_PATH
  }
}

function assertBaiduSuccess(payload: JsonObject): void {
  const errno = readInteger(payload.errno) ?? readInteger(payload.error_no)
  if (errno === undefined || errno === 0) return
  const message = readString(payload.errmsg) ?? readString(payload.error_msg) ?? 'Baidu Netdisk rejected the request.'
  if (errno === 6 || errno === 31023 || errno === 31024)
    throw new BaiduNetdiskConnectorError('AUTHENTICATION_FAILED', message, false, String(errno))
  if (errno === 3) throw new BaiduNetdiskConnectorError('PERMISSION_DENIED', message, false, String(errno))
  if (errno === 4 || errno === 31326)
    throw new BaiduNetdiskConnectorError('QUOTA_EXCEEDED', message, false, String(errno))
  if (errno === 404 || errno === 31066)
    throw new BaiduNetdiskConnectorError('FILE_NOT_FOUND', message, false, String(errno))
  throw new BaiduNetdiskConnectorError('UPSTREAM_REQUEST_FAILED', message, false, String(errno))
}

function httpError(status: number): BaiduNetdiskConnectorError {
  if (status === 401)
    return new BaiduNetdiskConnectorError('AUTHENTICATION_FAILED', 'Baidu Netdisk rejected the access token.')
  if (status === 403) return new BaiduNetdiskConnectorError('PERMISSION_DENIED', 'Baidu Netdisk denied this operation.')
  if (status === 429)
    return new BaiduNetdiskConnectorError('QUOTA_EXCEEDED', 'Baidu Netdisk request quota was exceeded.')
  if (status >= 500)
    return new BaiduNetdiskConnectorError(
      'UPSTREAM_UNAVAILABLE',
      `Baidu Netdisk is unavailable (HTTP ${status}).`,
      true
    )
  return new BaiduNetdiskConnectorError(
    'UPSTREAM_REQUEST_FAILED',
    `Baidu Netdisk rejected the HTTP request (HTTP ${status}).`
  )
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  return undefined
}

function readIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return undefined
}

function readIntegerList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.map(readInteger)
  return result.every((item): item is number => item !== undefined && item >= 0) ? result : undefined
}

function splitBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = []
  for (let offset = 0; offset < buffer.length; offset += chunkSize)
    chunks.push(buffer.subarray(offset, Math.min(buffer.length, offset + chunkSize)))
  return chunks
}
