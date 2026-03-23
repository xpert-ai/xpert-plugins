import type { ITenant, TChatConversationStatus } from '@metad/contracts'
import { TDocumentAsset } from '@xpert-ai/plugin-sdk'
import { AxiosError } from 'axios'

export const INTEGRATION_LARK = 'lark'
export const LarkName = 'lark'
export const LarkDocumentName = 'lark-document'

export const iconImage = `data:image/png;base64,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`

export type TLarkIntegrationConfig = {
  isLark?: boolean
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
  xpertId: string
  preferLanguage: 'en' | 'zh'
}

export type LarkDocumentsParams = {
  folderToken: string
  types: string[]
}

export type LarkDocumentMetadata = LarkFile & {
  chunkId: string
  assets?: TDocumentAsset[]
}


/**
 * Safely extract a readable message from an AxiosError or any unknown error.
 */
export function extractAxiosErrorMessage(error: unknown): string {
  // Handle AxiosError specifically
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError

    // If server responded with an error response
    if (axiosError.response) {
      const data = axiosError.response.data
      const status = axiosError.response.status
      const statusText = axiosError.response.statusText

      // Try to extract message from known response formats
      if (typeof data === 'string') {
        return `HTTP ${status} ${statusText}: ${data}`
      }
      if (data && typeof data === 'object' && 'message' in data) {
        return `HTTP ${status} ${statusText}: ${(data as any).message}`
      }
      if (data && typeof data === 'object' && 'error' in data) {
        return `HTTP ${status} ${statusText}: ${(data as any).error}`
      }

      // Default response fallback
      return `HTTP ${status} ${statusText}`
    }

    // If request was made but no response (network issues, timeout, etc.)
    if (axiosError.request) {
      return `No response received: ${axiosError.message}`
    }

    // Error occurred before sending request (config error, etc.)
    return `Axios error: ${axiosError.message}`
  }

  // Non-Axios errors
  if (error instanceof Error) {
    return error.message
  }

  // Unknown error type
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Type guard for AxiosError */
function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as any).isAxiosError === true
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizePermissionViolations(value: unknown): LarkPermissionViolation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const violations = value.reduce<LarkPermissionViolation[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc
    }

    const type = toNonEmptyString(item.type)
    const subject = toNonEmptyString(item.subject)
    if (type && subject) {
      acc.push({ type, subject })
    }

    return acc
  }, [])

  return violations.length > 0 ? violations : undefined
}

function normalizeFieldViolations(value: unknown): LarkFieldViolation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const violations = value
    .filter((item) => isRecord(item))
    .map((item) => ({ ...item }) as LarkFieldViolation)

  return violations.length > 0 ? violations : undefined
}

function looksLikeLarkErrorPayload(value: UnknownRecord): boolean {
  if (toNonEmptyString(value.msg)) {
    return true
  }

  if (toNonEmptyString(value.log_id) || toNonEmptyString(value.troubleshooter) || Array.isArray(value.field_violations)) {
    return true
  }

  if (!isRecord(value.error)) {
    return false
  }

  const detail = value.error
  return Boolean(
    toNonEmptyString(detail.message) ||
      toNonEmptyString(detail.log_id) ||
      toNonEmptyString(detail.troubleshooter) ||
      Array.isArray(detail.permission_violations) ||
      Array.isArray(detail.field_violations)
  )
}

function findLarkErrorPayload(error: unknown): UnknownRecord | undefined {
  const queue: unknown[] = [error]
  const visited = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || typeof current !== 'object') {
      continue
    }

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    const record = current as UnknownRecord
    if (looksLikeLarkErrorPayload(record)) {
      return record
    }

    const response = record.response
    if (isRecord(response) && response.data !== undefined) {
      queue.push(response.data)
    }

    if (record.data !== undefined) {
      queue.push(record.data)
    }
    if (record.error !== undefined) {
      queue.push(record.error)
    }
    if (record.errors !== undefined) {
      queue.push(record.errors)
    }
  }

  return undefined
}

export interface LarkPermissionViolation {
  type: string
  subject: string
}

export interface LarkFieldViolation {
  field?: string
  message?: string
  reason?: string
  [key: string]: unknown
}

export interface LarkErrorDetail {
  message: string
  log_id: string
  troubleshooter: string
  permission_violations?: LarkPermissionViolation[]
  field_violations?: LarkFieldViolation[]
}

export interface LarkError {
  code: number
  msg: string
  error: LarkErrorDetail
  log_id?: string
  troubleshooter?: string
  field_violations?: LarkFieldViolation[]
}

/**
 * Parse Lark SDK/Axios mixed error payloads, including nested array shapes like:
 * [[axiosError, larkErrorBody]]
 */
export function parseLarkClientError(error: unknown): LarkError {
  const payload = findLarkErrorPayload(error)
  if (!payload) {
    const message = extractAxiosErrorMessage(error)
    return {
      code: -1,
      msg: message,
      error: {
        message,
        log_id: '',
        troubleshooter: ''
      }
    }
  }

  const detail = isRecord(payload.error) ? payload.error : {}
  const fieldViolations = normalizeFieldViolations(detail.field_violations ?? payload.field_violations)
  const permissionViolations = normalizePermissionViolations(detail.permission_violations ?? payload.permission_violations)

  const message =
    toNonEmptyString(detail.message) ||
    toNonEmptyString(payload.msg) ||
    toNonEmptyString(payload.message) ||
    extractAxiosErrorMessage(error)

  const logId = toNonEmptyString(detail.log_id) || toNonEmptyString(payload.log_id) || ''
  const troubleshooter = toNonEmptyString(detail.troubleshooter) || toNonEmptyString(payload.troubleshooter) || ''

  return {
    code: toFiniteNumber(payload.code) ?? -1,
    msg: toNonEmptyString(payload.msg) || message,
    log_id: toNonEmptyString(payload.log_id),
    troubleshooter: toNonEmptyString(payload.troubleshooter),
    field_violations: fieldViolations,
    error: {
      message,
      log_id: logId,
      troubleshooter,
      permission_violations: permissionViolations,
      field_violations: fieldViolations
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatFieldViolation(violation: LarkFieldViolation, index: number): string {
  const field = toNonEmptyString(violation.field)
  const reason = toNonEmptyString(violation.message) || toNonEmptyString(violation.reason) || toNonEmptyString(violation.msg)

  if (field && reason) {
    return `${index + 1}. \`${field}\`: ${reason}`
  }
  if (field) {
    return `${index + 1}. \`${field}\``
  }
  if (reason) {
    return `${index + 1}. ${reason}`
  }

  return `${index + 1}. ${safeStringify(violation)}`
}

export function formatLarkErrorToMarkdown(error: LarkError): string {
  console.error(error)

  const { code, msg, error: errDetail } = error
  const fieldViolations = errDetail.field_violations || error.field_violations

  const permissionList =
    errDetail.permission_violations?.map((v, i) => `${i + 1}. **${v.subject}**  _(type: ${v.type})_`).join('\n') ||
    'None'
  const fieldViolationList = fieldViolations?.map((v, i) => formatFieldViolation(v, i)).join('\n') || 'None'

  return [
    `### 🚨 Lark API Error`,
    ``,
    `**Error Code:** \`${code}\``,
    ``,
    `**Message:** ${msg}`,
    ``,
    `**Details:**`,
    `> ${errDetail.message || ''}`,
    ``,
    `**Log ID:** \`${errDetail.log_id}\``,
    ``,
    `**Troubleshooter:** ${errDetail.troubleshooter || 'N/A'}`,
    ``,
    `**Field Violations:**`,
    `${fieldViolationList}`,
    ``,
    `**Permission Violations:**`,
    `${permissionList}`
  ].join('\n')
}

export interface LarkFile {
  token: string
  name: string
  type: string
  parent_token?: string | undefined
  url?: string | undefined
  shortcut_info?:
    | {
        target_type: string
        target_token: string
      }
    | undefined
  created_time?: string | undefined
  modified_time?: string | undefined
  owner_id?: string | undefined
}
export interface LarkListFilesResponse {
  files?: LarkFile[] | undefined
  next_page_token?: string | undefined
  has_more?: boolean | undefined
}


/**
 * Options for user provisioning when a new user interacts with the Lark integration.
 * - `autoProvision`: If true, automatically create a new user in the system when an unknown user interacts. Defaults to false.
 * - `roleName`: Optional role name to assign to provisioned users. If not specified, defaults to a standard user role.
 */
export type TLarkUserProvisionOptions = {
	autoProvision?: boolean
	roleName?: string
}

export type TIntegrationLarkOptions = {
  isLark?: boolean
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
  connectionMode?: 'webhook' | 'long_connection'
  xpertId: string
  preferLanguage: string
  userProvision?: TLarkUserProvisionOptions
}

export type TLarkConnectionMode = 'webhook' | 'long_connection'

export type TLarkLongConnectionState = 'idle' | 'connecting' | 'connected' | 'retrying' | 'unhealthy'

export type TLarkRuntimeStatus = {
  integrationId: string
  connectionMode: TLarkConnectionMode
  connected: boolean
  state: TLarkLongConnectionState
  ownerInstanceId?: string | null
  lastConnectedAt?: number | null
  lastError?: string | null
  failureCount?: number
  nextReconnectAt?: number | null
  disabledReason?: string | null
}

export type TLarkConnectionProbeState = 'connected' | 'failed'

export type TLarkConnectionProbeResult = {
  connectionMode: TLarkConnectionMode
  connected: boolean
  state: TLarkConnectionProbeState
  checkedAt: number
  endpointValidated: boolean
  lastError?: string | null
  recoverable?: boolean
}

export type LarkMessage = {
	data: {
		receive_id: string
		content: string
		msg_type: 'text' | 'post' | 'image' | 'interactive'
		uuid?: string
	}
	params: {
		receive_id_type: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id'
	}
}

export type ChatLarkContext<T = any> = {
	tenant: ITenant
	organizationId: string
	integrationId: string
	connectionMode?: TLarkConnectionMode
	userId: string
	/**
	 * Preferred language from integration options.
	 */
	preferLanguage?: string
	chatId?: string
	chatType?: 'p2p' | 'group' | string
	/**
	 * Lark platform sender's open_id (for @mention and private message)
	 */
	senderOpenId?: string
	senderName?: string
	principalKey?: string
	scopeKey?: string
	legacyConversationUserKey?: string
	message?: T
	input?: string
	semanticMessage?: LarkSemanticMessage
	recipientDirectoryKey?: string
	groupWindow?: LarkGroupWindow
	groupWindowId?: string
}

export type TLarkEventMention = {
	id:
		| string
		| {
				open_id?: string
				union_id?: string
				user_id?: string
		  }
	id_type?: 'open_id' | 'user_id' | 'union_id'
	key?: string
	name?: string
	tenant_key?: string
}

export type TLarkEvent = {
	schema: '2.0'
	header?: {
		event_id?: string
		event_type?: 'im.message.receive_v1'
		token?: string
		app_id?: string
		tenant_key?: string
		create_time?: string
	}
	event_id?: string
	token?: string
	create_time?: string
	event_type?: 'im.message.receive_v1'
	tenant_key?: string
	app_id?: string
	message: {
		chat_id: string
		chat_type: string
		content: string
		create_time: string
		message_id: string
		message_type: 'text' | 'image' | 'file' | 'audio'
		update_time: string
		mentions?: TLarkEventMention[]
	}
	sender: {
		sender_id: {
			open_id: string
			union_id: string
			user_id: string
		}
		sender_type: 'user'
		tenant_key: string
	}
}

export type TLarkEventEnvelope = {
	schema: '2.0'
	header?: TLarkEvent['header']
	event?: TLarkEvent
}

export type LarkMentionIdentity = {
	key: string
	id: string | null
	idType: 'open_id' | 'user_id' | 'union_id' | 'unknown'
	name: string | null
	rawToken: string
	isBot?: boolean
}

export type LarkSemanticMessage = {
	rawText: string
	displayText: string
	agentText: string
	mentions: LarkMentionIdentity[]
}

export type LarkMessageResourceType = 'file' | 'image' | 'audio' | 'media'

export type NormalizedMessageMention = {
	openId: string
	name?: string
	isBot?: boolean
}

export type NormalizedMessageResourceRef = {
	fileKey: string
	type?: LarkMessageResourceType | string
	name?: string
}

export type NormalizedMessage = {
	messageId: string
	chatId?: string
	senderOpenId?: string
	senderName?: string
	msgType: string
	text?: string
	mentions?: NormalizedMessageMention[]
	parentId?: string
	rootId?: string
	createTime?: string
	hasResource?: boolean
	resourceRefs?: NormalizedMessageResourceRef[]
}

export type NormalizedMessageResource = {
	messageId: string
	fileKey: string
	type: LarkMessageResourceType | string
	name?: string
	mimeType?: string
	size?: number
	contentEncoding?: 'base64'
	contentBase64?: string
}

export type LarkGroupWindowParticipant = {
	senderOpenId: string
	userId?: string
	senderName?: string
}

export type LarkGroupWindowItem = {
	messageId: string
	senderOpenId: string
	userId?: string
	senderName?: string
	text: string
	createTime?: string
	mentions?: NormalizedMessageMention[]
}

export type LarkGroupWindow = {
	windowId: string
	integrationId: string
	chatId: string
	scopeKey: string
	openedAt: number
	lastEventAt: number
	items: LarkGroupWindowItem[]
	participants: LarkGroupWindowParticipant[]
}

export type RecipientDirectoryEntry = {
	ref: string
	openId: string
	name: string
	aliases: string[]
	source: 'mention' | 'sender' | 'manual'
	firstSeenAt: number
	lastSeenAt: number
}

export type RecipientDirectory = {
	scopeType: 'group' | 'private'
	integrationId: string
	chatId?: string
	senderOpenId?: string
	entries: RecipientDirectoryEntry[]
}

export type LarkElementScalar = string | number | boolean | null

export interface LarkElementObject {
	[key: string]: LarkElementScalar | LarkElementObject | Array<LarkElementScalar | LarkElementObject>
}

export interface LarkCardElement extends LarkElementObject {
	tag: string
}

export interface LarkMarkdownElement extends LarkCardElement {
	tag: 'markdown'
	content: string
}

export type LarkStreamTextElement = LarkMarkdownElement

export type LarkEventElement = LarkMarkdownElement

export type LarkStructuredElement = LarkCardElement

export type LarkRenderElement =
	| LarkStreamTextElement
	| LarkEventElement
	| LarkStructuredElement

export enum LarkCardActionEnum {
	Confirm = 'lark-confirm',
	Reject = 'lark-reject',
	EndConversation = 'lark-end-conversation'
}

export type LarkCardActionPayload = {
	action: string
}

export type LarkCardActionValue = string | LarkCardActionPayload

export const LARK_END_CONVERSATION = LarkCardActionEnum.EndConversation
export const LARK_CONFIRM = LarkCardActionEnum.Confirm
export const LARK_REJECT = LarkCardActionEnum.Reject

export type TLarkConversationStatus = TChatConversationStatus | 'end'

export function isLarkCardActionValue(value: unknown): value is LarkCardActionValue {
	if (typeof value === 'string') {
		return true
	}

	if (!value || typeof value !== 'object') {
		return false
	}

	return typeof (value as LarkCardActionPayload).action === 'string'
}

export function resolveLarkCardActionValue(value: LarkCardActionValue): string {
	return typeof value === 'string' ? value : value.action
}

export function isEndAction(value: string) {
	return value === `"${LARK_END_CONVERSATION}"` || value === LARK_END_CONVERSATION
}

export function isConfirmAction(value: string) {
	return value === `"${LARK_CONFIRM}"` || value === LARK_CONFIRM
}

export function isRejectAction(value: string) {
	return value === `"${LARK_REJECT}"` || value === LARK_REJECT
}

export function isConversationAction(value: string) {
	return isEndAction(value) || isConfirmAction(value) || isRejectAction(value)
}
