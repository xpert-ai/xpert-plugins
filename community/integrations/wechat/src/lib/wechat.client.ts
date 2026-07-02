import { Injectable } from '@nestjs/common'
import { IIntegration } from '@xpert-ai/contracts'
import {
  normalizeApiVersion,
  normalizeBaseUrl,
  normalizeBoolean,
  normalizeString,
  normalizeTimeoutMs,
  normalizeWechatConnectionMode,
  TIntegrationWechatOptions,
  type WechatInboundFile,
  type WechatInboundVoiceRef
} from './types.js'
import { WechatTunnelBrokerService } from './wechat-tunnel-broker.service.js'

export interface WechatSendTextInput {
  uuid: string
  contactId: string
  content: string
  atUsers?: string[]
}

export interface WechatSendImageInput {
  uuid: string
  contactId: string
  imageContent: string
}

export interface WechatDownloadImageInput {
  uuid: string
  contactId: string
  newMsgId: string
  msgContent: string
  msgType: 3
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  preferHd?: boolean
  fileKey?: string
  originalName?: string
}

export type WechatDownloadVoiceInput = WechatInboundVoiceRef

export interface WechatSendResult {
  success: boolean
  messageId?: string
  error?: string
  raw?: unknown
}

export interface WechatBindDeviceKeyInput {
  key: string
}

export interface WechatDeviceLoginInput {
  uuid: string
}

export interface WechatDeviceLoginPollInput {
  uuid: string
  sessionId: string
}

export interface WechatDeviceLoginVerifyCodeInput {
  uuid: string
  code: string
  data62: string
  ticket: string
  sessionId?: string
}

export interface WechatDeviceLoginVerifySlideInput {
  data62: string
  ticket: string
  randstr: string
  slideticket: string
  sessionId?: string
}

export interface WechatDeviceAccountInput {
  uuid: string
}

export type WechatDownloadedImageFile = WechatInboundFile &
  Required<
    Pick<
      WechatInboundFile,
      'fileUrl' | 'url' | 'mimeType' | 'mimetype' | 'originalName' | 'name' | 'fileKey' | 'size' | 'extension'
    >
  >

export interface WechatDownloadImageResult {
  success: boolean
  file?: WechatDownloadedImageFile
  error?: string
  raw?: unknown
}

export interface WechatDownloadedVoiceFile {
  data: Buffer
  mimeType: 'audio/wav'
  originalName: string
  fileKey: string
  size: number
  durationMs?: number
}

export interface WechatDownloadVoiceResult {
  success: boolean
  audio?: WechatDownloadedVoiceFile
  error?: string
  raw?: unknown
}

type WechatHistoryMessageRecord = Record<string, unknown>

const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_INLINE_VOICE_BYTES = 10 * 1024 * 1024
const MAX_VOICE_DURATION_MS = 60 * 1000
const MEDIA_CHUNK_SIZE = 2 * 1024 * 1024

@Injectable()
export class WechatClient {
  constructor(private readonly tunnelBroker?: WechatTunnelBrokerService) {}

  async sendText(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatSendTextInput
  ): Promise<WechatSendResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const primary = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/sendtext'),
      this.buildV2Path(options, 'message/sendtext'),
      {
        uuid: input.uuid,
        contactid: input.contactId,
        textcontent: input.content,
        atusers: input.atUsers ?? []
      }
    )

    if (primary.success || options.fallbackToLegacySendText === false) {
      return primary
    }

    const legacyPath = `/message/SendTextMessage?key=${encodeURIComponent(input.uuid)}`
    const legacy = await this.postJson(
      integration,
      `${normalizeBaseUrl(options.baseUrl)}${legacyPath}`,
      legacyPath,
      {
        MsgItem: [
          {
            ToUserName: input.contactId,
            TextContent: input.content,
            MsgType: 1,
            AtWxIDList: input.atUsers ?? []
          }
        ]
      }
    )

    if (!legacy.success) {
      return {
        ...legacy,
        error: `${primary.error || 'primary send failed'}; fallback: ${legacy.error || 'legacy send failed'}`
      }
    }

    return legacy
  }

  async sendImage(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatSendImageInput
  ): Promise<WechatSendResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const primary = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/sendimage'),
      this.buildV2Path(options, 'message/sendimage'),
      {
        uuid: input.uuid,
        contactid: input.contactId,
        imagecontent: input.imageContent
      }
    )

    if (primary.success || options.fallbackToLegacySendImage === false) {
      return primary
    }

    const legacyPath = `/message/SendImageMessage?key=${encodeURIComponent(input.uuid)}`
    const legacy = await this.postJson(
      integration,
      `${normalizeBaseUrl(options.baseUrl)}${legacyPath}`,
      legacyPath,
      {
        MsgItem: [
          {
            ToUserName: input.contactId,
            ImageContent: input.imageContent,
            MsgType: 2
          }
        ]
      }
    )

    if (!legacy.success) {
      return {
        ...legacy,
        error: `${primary.error || 'primary send failed'}; fallback: ${legacy.error || 'legacy send failed'}`
      }
    }

    return legacy
  }

  async downloadImage(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDownloadImageInput
  ): Promise<WechatDownloadImageResult> {
    const preferred = input.preferHd !== false
    const first = await this.downloadImageOnce(integration, input, preferred)
    if (first.success || !preferred) {
      return first
    }

    const fallback = await this.downloadImageOnce(integration, input, false)
    if (!fallback.success) {
      return {
        ...fallback,
        error: `${first.error || 'HD image download failed'}; fallback: ${
          fallback.error || 'thumbnail image download failed'
        }`
      }
    }
    return fallback
  }

  async downloadVoice(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDownloadVoiceInput
  ): Promise<WechatDownloadVoiceResult> {
    if (input.durationMs && input.durationMs > MAX_VOICE_DURATION_MS) {
      return {
        success: false,
        error: `wx2.0 voice duration ${input.durationMs}ms exceeds maximum ${MAX_VOICE_DURATION_MS}ms`
      }
    }

    const first = await this.downloadVoiceFromInput(integration, input)
    if (first.success) {
      return first
    }

    if (!this.shouldRetryVoiceDownloadWithHistory(first)) {
      return first
    }

    const historyInput = await this.resolveHistoryVoiceDownloadInput(integration, input)
    if (!historyInput || !this.isDifferentVoiceDownloadInput(input, historyInput)) {
      return first
    }

    const retry = await this.downloadVoiceFromInput(integration, historyInput)
    if (retry.success) {
      return retry
    }

    return {
      ...retry,
      error: `${first.error || 'wx2.0 voice download failed'}; history retry: ${
        retry.error || 'wx2.0 voice download failed'
      }`
    }
  }

  private async downloadVoiceFromInput(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDownloadVoiceInput
  ): Promise<WechatDownloadVoiceResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const downloadResult = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/downloadfile'),
      this.buildV2Path(options, 'message/downloadfile'),
      this.buildVoiceDownloadBody(input)
    )
    if (!downloadResult.success) {
      return {
        ...downloadResult,
        error: this.withVoiceDownloadDiagnostics(downloadResult.error || 'wx2.0 voice download failed', input)
      }
    }

    const downloadData = this.resolveResponseData(downloadResult.raw)
    const fileExt = normalizeString(downloadData?.fileext || downloadData?.fileExt || downloadData?.FileExt).toLowerCase()
    if (fileExt === 'amr') {
      return {
        success: false,
        error: 'wx2.0 voice download returned AMR; wav conversion is not available',
        raw: downloadResult.raw
      }
    }

    const chunkResult = await this.downloadMediaChunks(integration, input, 'voice')
    if (!chunkResult.success || !chunkResult.data) {
      return {
        success: false,
        error: chunkResult.error || 'wx2.0 voice wav variant is not available',
        raw: downloadResult.raw
      }
    }

    if (!isWav(chunkResult.data)) {
      return {
        success: false,
        error: 'wx2.0 voice wav variant returned non-WAVE content',
        raw: downloadResult.raw
      }
    }

    const durationMs = resolveWavDurationMs(chunkResult.data) || input.durationMs
    if (durationMs && durationMs > MAX_VOICE_DURATION_MS) {
      return {
        success: false,
        error: `wx2.0 voice duration ${durationMs}ms exceeds maximum ${MAX_VOICE_DURATION_MS}ms`,
        raw: downloadResult.raw
      }
    }

    const originalName =
      input.originalName ||
      normalizeString(downloadData?.filename || downloadData?.filetitle || downloadData?.fileName || downloadData?.fileTitle) ||
      `${input.newMsgId || input.fileKey || 'wechat-voice'}.wav`

    return {
      success: true,
      audio: {
        data: chunkResult.data,
        mimeType: 'audio/wav',
        originalName: originalName.toLowerCase().endsWith('.wav') ? originalName : `${originalName}.wav`,
        fileKey: input.fileKey || input.newMsgId,
        size: chunkResult.data.length,
        durationMs
      },
      raw: {
        download: downloadResult.raw,
        chunks: chunkResult.raw
      }
    }
  }

  private shouldRetryVoiceDownloadWithHistory(result: WechatDownloadVoiceResult): boolean {
    if (result.success) {
      return false
    }

    return Boolean(result.error?.includes('voiceDownloadInput{'))
  }

  private buildVoiceDownloadBody(input: WechatDownloadVoiceInput): Record<string, unknown> {
    const body: Record<string, unknown> = {
      uuid: input.uuid,
      newmsgid: input.newMsgId,
      msgcontent: input.msgContent,
      msgtype: input.msgType,
      contactid: input.contactId,
      fromuser: input.fromUser,
      touser: input.toUser,
      msgid: input.msgId,
      isself: input.isSelf,
      preferhd: false
    }
    if (input.bufId) {
      body.bufid = input.bufId
    }
    if (input.byteLength) {
      body.voicelen = input.byteLength
    }
    if (input.format) {
      body.voiceformat = input.format
    }
    return body
  }

  async bindDeviceKey(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatBindDeviceKeyInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/bindkey', {
      key: input.key
    })
  }

  async listDeviceAccounts(
    integration: IIntegration<TIntegrationWechatOptions>
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/getalluserlist', {})
  }

  async startDeviceLogin(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceLoginInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/getqrcode', {
      uuid: input.uuid
    })
  }

  async pollDeviceLogin(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceLoginPollInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/getscanuser', {
      uuid: input.uuid,
      sessionId: input.sessionId
    })
  }

  async verifyLoginCode(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceLoginVerifyCodeInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/verifylogincode', {
      uuid: input.uuid,
      code: input.code,
      data62: input.data62,
      ticket: input.ticket,
      sessionId: input.sessionId
    })
  }

  async verifyLoginSlide(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceLoginVerifySlideInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/verifyloginslide', {
      data62: input.data62,
      ticket: input.ticket,
      randstr: input.randstr,
      slideticket: input.slideticket,
      sessionId: input.sessionId
    })
  }

  async logoutDeviceAccount(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceAccountInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/exitlogin', {
      uuid: input.uuid
    })
  }

  async deleteDeviceAccount(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDeviceAccountInput
  ): Promise<WechatSendResult> {
    return this.postV2Json(integration, 'account/deletekey', {
      uuid: input.uuid
    })
  }

  private async postV2Json(
    integration: IIntegration<TIntegrationWechatOptions>,
    path: string,
    body: Record<string, unknown>
  ): Promise<WechatSendResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    return this.postJson(
      integration,
      this.buildV2Url(options, path),
      this.buildV2Path(options, path),
      body
    )
  }

  private buildV2Url(options: TIntegrationWechatOptions, path: string): string {
    const baseUrl = normalizeBaseUrl(options.baseUrl)
    const apiVersion = normalizeApiVersion(options.apiVersion)
    return `${baseUrl}${apiVersion}${path.replace(/^\/+/, '')}`
  }

  private buildV2Path(options: TIntegrationWechatOptions, path: string): string {
    const apiVersion = normalizeApiVersion(options.apiVersion)
    return `${apiVersion}${path.replace(/^\/+/, '')}`
  }

  private async downloadImageOnce(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDownloadImageInput,
    preferHd: boolean
  ): Promise<WechatDownloadImageResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const result = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/downloadfile'),
      this.buildV2Path(options, 'message/downloadfile'),
      {
        uuid: input.uuid,
        newmsgid: input.newMsgId,
        msgcontent: input.msgContent,
        msgtype: input.msgType,
        contactid: input.contactId,
        fromuser: input.fromUser,
        touser: input.toUser,
        msgid: input.msgId,
        isself: input.isSelf,
        preferhd: preferHd
      }
    )
    if (!result.success) {
      return result
    }
    return this.resolveDownloadedImage(result.raw, input, preferHd)
  }

  private resolveDownloadedImage(
    payload: unknown,
    input: WechatDownloadImageInput,
    preferHd: boolean
  ): WechatDownloadImageResult {
    const data = this.resolveResponseData(payload)
    const encoded = normalizeString(data?.filedata || data?.fileData || data?.FileData)
    if (!encoded) {
      return {
        success: false,
        error: 'wx2.0 image download did not return inline filedata',
        raw: payload
      }
    }

    const base64 = stripDataUrlPrefix(encoded)
    const bytes = Buffer.from(base64, 'base64')
    const mimeType = detectImageMimeType(bytes)
    if (!mimeType) {
      return {
        success: false,
        error: 'wx2.0 image download returned non-image content',
        raw: payload
      }
    }
    if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
      return {
        success: false,
        error: `wx2.0 image download returned ${bytes.length} bytes; maximum is ${MAX_INLINE_IMAGE_BYTES} bytes`,
        raw: payload
      }
    }

    const extension = imageExtension(mimeType)
    const extensionName = extension.replace(/^\./, '')
    const fileKey = input.fileKey || input.newMsgId
    const originalName =
      input.originalName ||
      normalizeString(data?.filename || data?.filetitle || data?.fileName || data?.fileTitle) ||
      `${input.newMsgId || input.fileKey || 'wechat-image'}${extension}`
    const fileUrl = `data:${mimeType};base64,${base64}`
    return {
      success: true,
      file: {
        fileUrl,
        url: fileUrl,
        mimeType,
        mimetype: mimeType,
        originalName,
        name: originalName,
        fileKey,
        size: bytes.length,
        extension: extensionName
      },
      raw: {
        ...(payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}),
        downloadQuality: preferHd ? 'hd' : 'thumb'
      }
    }
  }

  private async downloadMediaChunks(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: Pick<WechatDownloadVoiceInput, 'uuid' | 'newMsgId'>,
    variant: string
  ): Promise<{ success: boolean; data?: Buffer; error?: string; raw?: unknown[] }> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const chunks: Buffer[] = []
    const rawResponses: unknown[] = []
    let offset = 0

    for (let index = 0; index < 20; index += 1) {
      const result = await this.postJson(
        integration,
        this.buildV2Url(options, 'message/getmediafilechunk'),
        this.buildV2Path(options, 'message/getmediafilechunk'),
        {
          uuid: input.uuid,
          newmsgid: input.newMsgId,
          variant,
          offset,
          length: MEDIA_CHUNK_SIZE
        }
      )
      rawResponses.push(result.raw)
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          raw: rawResponses
        }
      }

      const data = this.resolveResponseData(result.raw)
      const encoded = normalizeString(data?.filedata || data?.fileData || data?.FileData)
      const total = normalizeNumber(data?.total || data?.Total)
      const length = normalizeNumber(data?.length || data?.Length) ?? 0
      const done = data?.done === true || data?.Done === true
      if (!encoded && done) {
        break
      }
      if (!encoded) {
        return {
          success: false,
          error: 'wx2.0 media chunk did not return filedata',
          raw: rawResponses
        }
      }

      const chunk = Buffer.from(stripDataUrlPrefix(encoded), 'base64')
      chunks.push(chunk)
      const currentSize = chunks.reduce((sum, item) => sum + item.length, 0)
      if (currentSize > MAX_INLINE_VOICE_BYTES) {
        return {
          success: false,
          error: `wx2.0 voice download returned more than ${MAX_INLINE_VOICE_BYTES} bytes`,
          raw: rawResponses
        }
      }

      offset += length || chunk.length
      if (done || (total && offset >= total)) {
        break
      }
    }

    const data = Buffer.concat(chunks)
    if (!data.length) {
      return {
        success: false,
        error: 'wx2.0 media chunks were empty',
        raw: rawResponses
      }
    }
    return {
      success: true,
      data,
      raw: rawResponses
    }
  }

  private async resolveHistoryVoiceDownloadInput(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatDownloadVoiceInput
  ): Promise<WechatDownloadVoiceInput | null> {
    if (!input.uuid || !input.contactId) {
      return null
    }

    const options = integration.options || ({} as TIntegrationWechatOptions)
    const result = await this.postJson(
      integration,
      this.buildV2Url(options, 'message/listhistory'),
      this.buildV2Path(options, 'message/listhistory'),
      {
        uuid: input.uuid,
        contactid: input.contactId,
        cursor: 0,
        pagesize: 50
      }
    )
    if (!result.success) {
      return null
    }

    const data = this.resolveResponsePayloadData(result.raw)
    if (!Array.isArray(data)) {
      return null
    }

    const match = this.findMatchingHistoryVoice(data, input)
    if (!match) {
      return null
    }

    return this.buildVoiceDownloadInputFromHistory(input, match)
  }

  private findMatchingHistoryVoice(
    items: unknown[],
    input: WechatDownloadVoiceInput
  ): WechatHistoryMessageRecord | null {
    const voiceItems = items
      .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? (item as WechatHistoryMessageRecord) : null))
      .filter((item): item is WechatHistoryMessageRecord => {
        const msgType = normalizeNumber(item.msgtype || item.msgType || item.Msgtype)
        return msgType === 34
      })

    const byNewMsgId = voiceItems.find((item) => this.historyNewMsgId(item) === input.newMsgId)
    if (byNewMsgId) {
      return byNewMsgId
    }

    if (input.msgId) {
      const byMsgId = voiceItems.find((item) => normalizeNumber(item.msgid || item.msgId || item.Msgid) === input.msgId)
      if (byMsgId) {
        return byMsgId
      }
    }

    const inputBufId = normalizeString(input.bufId)
    const inputLength = input.byteLength
    if (inputBufId || inputLength) {
      return (
        voiceItems.find((item) => {
          const content = this.historyContent(item)
          const bufId = resolveXmlAttribute(content, 'bufid')
          const length = normalizeNumber(resolveXmlAttribute(content, 'length'))
          return Boolean(
            (inputBufId && inputBufId !== '0' && bufId === inputBufId) ||
              (inputLength && length === inputLength)
          )
        }) || null
      )
    }

    return null
  }

  private buildVoiceDownloadInputFromHistory(
    input: WechatDownloadVoiceInput,
    item: WechatHistoryMessageRecord
  ): WechatDownloadVoiceInput {
    const content = this.historyContent(item) || input.msgContent
    const newMsgId = this.historyNewMsgId(item) || input.newMsgId
    const msgId = normalizeNumber(item.msgid || item.msgId || item.Msgid) ?? input.msgId
    const isSelf = this.historyBoolean(item, 'isself', 'isSelf', 'Isself')

    return {
      ...input,
      newMsgId,
      msgContent: content,
      fromUser: normalizeString(item.fromuser || item.fromUser || item.Fromuser) || input.fromUser,
      toUser: normalizeString(item.touser || item.toUser || item.Touser) || input.toUser,
      msgId,
      isSelf: isSelf ?? input.isSelf,
      fileKey: input.fileKey || newMsgId,
      originalName: input.originalName,
      bufId: resolveXmlAttribute(content, 'bufid') || input.bufId,
      durationMs:
        normalizeNumber(resolveXmlAttribute(content, 'voicelength') || resolveXmlAttribute(content, 'playlength')) ||
        input.durationMs,
      format: resolveXmlAttribute(content, 'voiceformat') || input.format,
      byteLength: normalizeNumber(resolveXmlAttribute(content, 'length')) || input.byteLength
    }
  }

  private isDifferentVoiceDownloadInput(
    left: WechatDownloadVoiceInput,
    right: WechatDownloadVoiceInput
  ): boolean {
    return (
      left.newMsgId !== right.newMsgId ||
      left.msgContent !== right.msgContent ||
      left.fromUser !== right.fromUser ||
      left.toUser !== right.toUser ||
      left.msgId !== right.msgId ||
      left.isSelf !== right.isSelf
    )
  }

  private historyNewMsgId(item: WechatHistoryMessageRecord): string {
    return normalizeString(item.newmsgid || item.newMsgId || item.Newmsgid || item.new_msg_id || item.newMsgID)
  }

  private historyContent(item: WechatHistoryMessageRecord): string {
    return (
      normalizeString(item.rawcontent || item.rawContent || item.RawContent) ||
      normalizeString(item.content || item.Content)
    )
  }

  private historyBoolean(
    item: WechatHistoryMessageRecord,
    ...keys: string[]
  ): boolean | undefined {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        return normalizeBoolean(item[key])
      }
    }
    return undefined
  }

  private withVoiceDownloadDiagnostics(error: string, input: WechatDownloadVoiceInput): string {
    const diagnostics = this.describeVoiceDownloadInput(input)
    return diagnostics ? `${error}; voiceDownloadInput{${diagnostics}}` : error
  }

  private describeVoiceDownloadInput(input: WechatDownloadVoiceInput): string {
    const content = input.msgContent || ''
    const fields: Array<[string, string | number | boolean | undefined]> = [
      ['uuid', input.uuid],
      ['newMsgId', input.newMsgId],
      ['contactId', input.contactId],
      ['fromUser', input.fromUser],
      ['toUser', input.toUser],
      ['msgId', input.msgId],
      ['isSelf', input.isSelf],
      ['bufId', input.bufId],
      ['byteLength', input.byteLength],
      ['durationMs', input.durationMs],
      ['format', input.format],
      ['newMsgIdUnsafeInteger', isUnsafeIntegerString(input.newMsgId) ? true : undefined],
      ['hasVoiceXml', /<voicemsg\b/i.test(content)],
      ['msgContentLength', content.length]
    ]
    return fields
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ')
  }

  private async postJson(
    integration: IIntegration<TIntegrationWechatOptions>,
    url: string,
    tunnelPath: string,
    body: Record<string, unknown>
  ): Promise<WechatSendResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const connectionMode = normalizeWechatConnectionMode(options.connectionMode)
    if (connectionMode === 'reverse_tunnel') {
      return this.postJsonViaTunnel(integration, tunnelPath, body)
    }

    if (!normalizeBaseUrl(options.baseUrl)) {
      return {
        success: false,
        error: 'wx2.0 baseUrl is required for direct_http mode'
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), normalizeTimeoutMs(options.timeoutMs))
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = normalizeString(options.apiToken)
      if (token) {
        headers.token = token
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
      return this.resolveHttpResult(response.status, response.ok, await response.text().catch(() => ''))
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async postJsonViaTunnel(
    integration: IIntegration<TIntegrationWechatOptions>,
    path: string,
    body: Record<string, unknown>
  ): Promise<WechatSendResult> {
    const options = integration.options || ({} as TIntegrationWechatOptions)
    const clientId = normalizeString(integration.id)
    if (!clientId) {
      return {
        success: false,
        error: 'wechat reverse tunnel integration id is required'
      }
    }
    if (!this.tunnelBroker) {
      return {
        success: false,
        error: 'wechat reverse tunnel broker is unavailable'
      }
    }

    try {
      await this.syncTunnelScope(integration, clientId)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = normalizeString(options.apiToken)
      if (token) {
        headers.token = token
      }

      const response = await this.tunnelBroker.sendHttpRequest({
        clientId,
        method: 'POST',
        path,
        headers,
        body: JSON.stringify(body),
        timeoutMs: normalizeTimeoutMs(options.timeoutMs),
        tenantId: integration.tenantId ?? null,
        organizationId: integration.organizationId ?? null
      })
      return this.resolveHttpResult(response.status, response.status >= 200 && response.status < 300, response.text)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async syncTunnelScope(
    integration: IIntegration<TIntegrationWechatOptions>,
    clientId: string
  ): Promise<void> {
    const sync = this.tunnelBroker?.syncManagedClientScope
    if (typeof sync !== 'function') {
      return
    }
    await sync.call(this.tunnelBroker, clientId, {
      tenantId: integration.tenantId ?? null,
      organizationId: integration.organizationId ?? null,
      integrationId: integration.id,
      integrationName: normalizeString((integration as { name?: string | null }).name) || integration.id
    })
  }

  private parsePayload(text: string): unknown {
    if (!text) {
      return null
    }
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private resolveHttpResult(status: number, ok: boolean, text: string): WechatSendResult {
    const payload = this.parsePayload(text)
    if (!ok) {
      return {
        success: false,
        error: `wx2.0 HTTP ${status}`,
        raw: payload
      }
    }

    const code = this.resolveResponseCode(payload)
    if (typeof code === 'number' && code !== 0 && code !== 200) {
      return {
        success: false,
        error: this.resolveResponseText(payload) || `wx2.0 returned code ${code}`,
        raw: payload
      }
    }

    return {
      success: true,
      messageId: this.resolveMessageId(payload),
      raw: payload
    }
  }

  private resolveResponseCode(payload: unknown): number | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const record = payload as Record<string, unknown>
    const value = record.code ?? record.Code
    return typeof value === 'number' ? value : undefined
  }

  private resolveResponseText(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return typeof payload === 'string' ? payload : undefined
    }
    const record = payload as Record<string, unknown>
    return normalizeString(record.text || record.Text || record.message || record.Message) || undefined
  }

  private resolveMessageId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const record = payload as Record<string, unknown>
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
    return normalizeString(data.newmsgid || data.newMsgId || data.messageId || data.msgid) || undefined
  }

  private resolveResponseData(payload: unknown): Record<string, unknown> | null {
    const data = this.resolveResponsePayloadData(payload)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null
    }
    return data as Record<string, unknown>
  }

  private resolveResponsePayloadData(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return null
    }
    const record = payload as Record<string, unknown>
    if (record.data !== undefined) {
      return record.data
    }
    if (record.Data !== undefined) {
      return record.Data
    }
    return record
  }
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function resolveXmlAttribute(content: string, name: string): string {
  const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']+)["']`, 'i')
  return normalizeString(content.match(pattern)?.[1])
}

function isUnsafeIntegerString(value: string | undefined): boolean {
  const text = normalizeString(value)
  if (!/^\d+$/.test(text)) {
    return false
  }
  if (text.length > String(Number.MAX_SAFE_INTEGER).length) {
    return true
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed > Number.MAX_SAFE_INTEGER
}

function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:[^;]+;base64,(.*)$/i)
  return (match?.[1] || value).replace(/\s+/g, '')
}

function isWav(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE'
}

function resolveWavDurationMs(bytes: Buffer): number | undefined {
  if (!isWav(bytes)) {
    return undefined
  }

  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.subarray(offset, offset + 4).toString()
    const chunkSize = bytes.readUInt32LE(offset + 4)
    const chunkDataOffset = offset + 8
    if (chunkId === 'fmt ' && chunkSize >= 16 && chunkDataOffset + 12 <= bytes.length) {
      byteRate = bytes.readUInt32LE(chunkDataOffset + 8)
    }
    if (chunkId === 'data') {
      dataSize = chunkSize
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2)
  }

  if (!byteRate || !dataSize) {
    return undefined
  }
  return Math.round((dataSize / byteRate) * 1000)
}

function detectImageMimeType(bytes: Buffer): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a')) {
    return 'image/gif'
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    return 'image/webp'
  }
  return undefined
}

function imageExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    default:
      return '.jpg'
  }
}
