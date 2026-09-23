import type { WorkspaceFileLocator } from '@xpert-ai/plugin-sdk'

export type QqMailProtocolCredential = {
  email: string
  authorizationCode: string
}

export type MailAddressDto = {
  name?: string
  address: string
}

export type MailAttachmentDto = {
  attachmentId: string
  filename: string
  contentType: string
  size?: number
  inline: boolean
}

export type MailSummaryDto = {
  messageRef: string
  uid: number
  subject: string
  from: MailAddressDto[]
  to: MailAddressDto[]
  date?: string
  receivedAt?: string
  size?: number
  read: boolean
  starred: boolean
  hasAttachments: boolean
}

export type MailDetailDto = MailSummaryDto & {
  cc: MailAddressDto[]
  replyTo: MailAddressDto[]
  messageId?: string
  inReplyTo?: string
  text: string
  truncated: boolean
  attachments: MailAttachmentDto[]
}

export type MailSendAttachment = {
  locator: WorkspaceFileLocator
  filename?: string
}

export type MailSendInput = {
  operationId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: MailSendAttachment[]
  inReplyTo?: string
  references?: string[]
}

export type MailSendReceipt = {
  operationId: string
  messageId: string
  deliveryState: 'accepted' | 'unknown'
  accepted: string[]
  rejected: string[]
}
