import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { Injectable } from '@nestjs/common'
import type { FetchMessageObject, MessageAddressObject, MessageStructureObject, SearchObject } from 'imapflow'
import { convert } from 'html-to-text'
import type { Options as MailOptions } from 'nodemailer/lib/mailer/index.js'
import type { WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import {
  NETEASE_MAIL_DEFAULT_SEARCH_LIMIT,
  NETEASE_MAIL_MAX_ATTACHMENT_BYTES,
  NETEASE_MAIL_MAX_BODY_BYTES,
  NETEASE_MAIL_MAX_BODY_CHARS,
  NETEASE_MAIL_MAX_FOLDER_COUNT,
  NETEASE_MAIL_MAX_SEARCH_LIMIT,
  NETEASE_MAIL_MAX_SEARCH_MATCHES,
  NETEASE_MAIL_MAX_TOTAL_ATTACHMENT_BYTES
} from './constants.js'
import {
  isUncertainSmtpDelivery,
  NeteaseMailError,
  normalizeMailConnectionError,
  normalizeMailSendError
} from './errors.js'
import { ImapClientFactory } from './imap-client.factory.js'
import { MailReferenceService } from './mail-reference.service.js'
import { SmtpClientFactory } from './smtp-client.factory.js'
import type {
  MailAddressDto,
  MailAttachmentDto,
  MailDetailDto,
  MailSendInput,
  MailSendReceipt,
  MailSummaryDto,
  NeteaseMailCredential
} from './types.js'

export type ListMailFoldersInput = {
  limit?: number
}

export type SearchEmailsInput = {
  folder?: string
  from?: string
  subject?: string
  since?: string
  before?: string
  unreadOnly?: boolean
  cursor?: string
  limit?: number
}

export type SearchEmailsResult = {
  folder: string
  items: MailSummaryDto[]
  hasMore: boolean
  nextCursor?: string
}

const NETEASE_MAIL_SEARCH_FETCH_BATCH_SIZE = 100

@Injectable()
export class NeteaseMailService {
  constructor(
    private readonly imapClientFactory: ImapClientFactory,
    private readonly smtpClientFactory: SmtpClientFactory,
    private readonly references: MailReferenceService
  ) {}

  async verifyCredential(credential: NeteaseMailCredential): Promise<void> {
    await this.withImap(credential, async (client) => {
      await client.mailboxOpen('INBOX', { readOnly: true })
    })

    const transport = this.smtpClientFactory.create(credential)
    try {
      await transport.verify()
    } catch (error) {
      throw normalizeMailConnectionError(error, 'smtp')
    } finally {
      transport.close()
    }
  }

  async listFolders(credential: NeteaseMailCredential, input: ListMailFoldersInput) {
    const limit = Math.min(input.limit ?? 100, NETEASE_MAIL_MAX_FOLDER_COUNT)
    return this.withImap(credential, async (client) => {
      const folders = await client.list({
        statusQuery: {
          messages: true,
          unseen: true,
          uidValidity: true
        }
      })
      return {
        items: folders.slice(0, limit).map((folder) => ({
          path: folder.path,
          name: folder.name,
          specialUse: folder.specialUse ?? undefined,
          subscribed: folder.subscribed,
          selectable: !folder.flags.has('\\Noselect'),
          messageCount: folder.status?.messages ?? undefined,
          unreadCount: folder.status?.unseen ?? undefined
        })),
        truncated: folders.length > limit
      }
    })
  }

  async searchEmails(credential: NeteaseMailCredential, input: SearchEmailsInput): Promise<SearchEmailsResult> {
    const folder = input.folder?.trim() || 'INBOX'
    const limit = Math.min(input.limit ?? NETEASE_MAIL_DEFAULT_SEARCH_LIMIT, NETEASE_MAIL_MAX_SEARCH_LIMIT)

    return this.withImap(credential, async (client) => {
      const mailbox = await client.mailboxOpen(folder, { readOnly: true })
      const uidValidity = mailbox.uidValidity.toString()
      const cursor = input.cursor ? this.references.decodeCursor(input.cursor) : undefined
      if (cursor?.folder !== undefined && cursor.folder !== folder) {
        throw new NeteaseMailError('MAIL_REFERENCE_INVALID', 'The search cursor belongs to another mail folder.')
      }
      if (cursor && cursor.uidValidity !== uidValidity) {
        throw new NeteaseMailError('MAIL_REFERENCE_STALE', 'The mail folder changed and the search must be restarted.')
      }
      if (cursor?.beforeUid === 1) {
        return { folder, items: [], hasMore: false }
      }

      // NetEase IMAP returns false negatives for SUBJECT and FROM on messages that
      // are otherwise fetchable, so those decoded envelope fields are filtered here.
      const criteria = buildProviderSearchCriteria(input, cursor?.beforeUid)
      const matches = (await client.search(criteria, { uid: true })) || []
      const orderedUids = matches.slice(-NETEASE_MAIL_MAX_SEARCH_MATCHES).sort((left, right) => right - left)

      if (!orderedUids.length) {
        return { folder, items: [], hasMore: false }
      }

      const matchedItems: MailSummaryDto[] = []
      searchBatches: for (let offset = 0; offset < orderedUids.length; offset += NETEASE_MAIL_SEARCH_FETCH_BATCH_SIZE) {
        const batchUids = orderedUids.slice(offset, offset + NETEASE_MAIL_SEARCH_FETCH_BATCH_SIZE)
        const fetched = new Map<number, FetchMessageObject>()
        for await (const message of client.fetch(
          batchUids,
          {
            uid: true,
            flags: true,
            envelope: true,
            internalDate: true,
            size: true,
            bodyStructure: true
          },
          { uid: true }
        )) {
          fetched.set(message.uid, message)
        }

        for (const uid of batchUids) {
          const message = fetched.get(uid)
          if (!message || !matchesEnvelopeFilters(message, input)) {
            continue
          }
          matchedItems.push(this.toSummary(folder, uidValidity, message))
          if (matchedItems.length > limit) {
            break searchBatches
          }
        }
      }

      const items = matchedItems.slice(0, limit)
      const hasMore = matchedItems.length > limit
      const lastUid = items.at(-1)?.uid

      return {
        folder,
        items,
        hasMore,
        ...(hasMore && lastUid
          ? {
              nextCursor: this.references.encodeCursor({
                folder,
                uidValidity,
                beforeUid: lastUid
              })
            }
          : {})
      }
    })
  }

  async getEmail(credential: NeteaseMailCredential, messageRef: string): Promise<MailDetailDto> {
    const reference = this.references.decodeMessage(messageRef)
    return this.withReferencedMessage(credential, reference, true, async (client, message) => {
      const summary = this.toSummary(reference.folder, reference.uidValidity, message)
      const body = await downloadPreferredBody(client, reference.uid, message.bodyStructure)
      return {
        ...summary,
        cc: toAddressDtos(message.envelope?.cc),
        replyTo: toAddressDtos(message.envelope?.replyTo),
        messageId: cleanMessageId(message.envelope?.messageId),
        inReplyTo: cleanMessageId(message.envelope?.inReplyTo),
        text: body.text,
        truncated: body.truncated,
        attachments: listAttachments(message.bodyStructure)
      }
    })
  }

  async downloadAttachment(
    credential: NeteaseMailCredential,
    messageRef: string,
    attachmentId: string,
    workspaceFiles: Pick<WorkspaceFilesApi, 'writeRuntimeBuffer'>
  ) {
    const reference = this.references.decodeMessage(messageRef)
    return this.withReferencedMessage(credential, reference, true, async (client, message) => {
      const attachment = findAttachment(message.bodyStructure, attachmentId)
      if (!attachment) {
        throw new NeteaseMailError('MAIL_ATTACHMENT_NOT_FOUND', 'The requested attachment was not found.')
      }
      if (attachment.size && attachment.size > NETEASE_MAIL_MAX_ATTACHMENT_BYTES) {
        throw new NeteaseMailError(
          'MAIL_ATTACHMENT_TOO_LARGE',
          `The attachment exceeds the ${NETEASE_MAIL_MAX_ATTACHMENT_BYTES}-byte download limit.`
        )
      }

      const downloaded = await client.download(reference.uid, attachmentId, {
        uid: true,
        maxBytes: NETEASE_MAIL_MAX_ATTACHMENT_BYTES + 1
      })
      const buffer = await streamToBuffer(downloaded.content)
      if (buffer.length > NETEASE_MAIL_MAX_ATTACHMENT_BYTES) {
        throw new NeteaseMailError(
          'MAIL_ATTACHMENT_TOO_LARGE',
          `The attachment exceeds the ${NETEASE_MAIL_MAX_ATTACHMENT_BYTES}-byte download limit.`
        )
      }

      const originalName = sanitizeFilename(attachment.filename || downloaded.meta.filename || 'attachment')
      const path = `mail-attachments/${reference.uid}-${attachmentId.replaceAll('.', '-')}-${originalName}`
      const written = await workspaceFiles.writeRuntimeBuffer({
        path,
        originalName,
        mimeType: attachment.contentType,
        buffer
      })

      return {
        name: written.name,
        filePath: written.filePath,
        workspacePath: written.workspacePath,
        fileRef: written.reference,
        mimeType: written.mimeType || attachment.contentType,
        size: written.size ?? buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex')
      }
    })
  }

  async setFlags(credential: NeteaseMailCredential, messageRef: string, flags: { read?: boolean; starred?: boolean }) {
    const reference = this.references.decodeMessage(messageRef)
    return this.withReferencedMessage(credential, reference, false, async (client) => {
      if (flags.read !== undefined) {
        const update = flags.read ? client.messageFlagsAdd.bind(client) : client.messageFlagsRemove.bind(client)
        await update(reference.uid, ['\\Seen'], { uid: true, silent: true })
      }
      if (flags.starred !== undefined) {
        const update = flags.starred ? client.messageFlagsAdd.bind(client) : client.messageFlagsRemove.bind(client)
        await update(reference.uid, ['\\Flagged'], { uid: true, silent: true })
      }
      return {
        messageRef,
        status: 'updated' as const,
        ...(flags.read !== undefined ? { read: flags.read } : {}),
        ...(flags.starred !== undefined ? { starred: flags.starred } : {})
      }
    })
  }

  async sendEmail(
    credential: NeteaseMailCredential,
    input: MailSendInput,
    workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>
  ): Promise<MailSendReceipt> {
    const attachments: NonNullable<MailOptions['attachments']> = []
    let totalAttachmentBytes = 0
    for (const descriptor of input.attachments ?? []) {
      const file = await workspaceFiles.readRuntimeBuffer(descriptor.locator)
      totalAttachmentBytes += file.buffer.length
      if (!file.buffer.length || totalAttachmentBytes > NETEASE_MAIL_MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new NeteaseMailError(
          'MAIL_ATTACHMENT_TOO_LARGE',
          `Email attachments must be non-empty and total no more than ${NETEASE_MAIL_MAX_TOTAL_ATTACHMENT_BYTES} bytes.`
        )
      }
      attachments.push({
        filename: sanitizeFilename(descriptor.filename || file.name),
        content: file.buffer,
        contentType: file.mimeType || 'application/octet-stream'
      })
    }

    const generatedMessageId = `<${input.operationId}.xpert@${credential.email.split('@')[1]}>`
    const transport = this.smtpClientFactory.create(credential)
    try {
      const info = await transport.sendMail({
        from: credential.email,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments,
        messageId: generatedMessageId,
        inReplyTo: input.inReplyTo,
        references: input.references,
        disableFileAccess: true,
        disableUrlAccess: true
      })
      const accepted = normalizeSmtpAddresses(info.accepted)
      const rejected = normalizeSmtpAddresses(info.rejected)
      if (!accepted.length) {
        throw new NeteaseMailError('MAIL_SEND_REJECTED', 'The SMTP server did not accept any recipients.')
      }
      return {
        operationId: input.operationId,
        messageId: typeof info.messageId === 'string' && info.messageId ? info.messageId : generatedMessageId,
        deliveryState: 'accepted',
        accepted,
        rejected
      }
    } catch (error) {
      if (isUncertainSmtpDelivery(error)) {
        return {
          operationId: input.operationId,
          messageId: generatedMessageId,
          deliveryState: 'unknown',
          accepted: [],
          rejected: []
        }
      }
      if (error instanceof NeteaseMailError) {
        throw error
      }
      throw normalizeMailSendError(error)
    } finally {
      transport.close()
    }
  }

  private async withImap<T>(
    credential: NeteaseMailCredential,
    operation: (client: ReturnType<ImapClientFactory['create']>) => Promise<T>
  ): Promise<T> {
    const client = this.imapClientFactory.create(credential)
    try {
      await client.connect()
      return await operation(client)
    } catch (error) {
      if (error instanceof NeteaseMailError) {
        throw error
      }
      throw normalizeMailConnectionError(error, 'imap')
    } finally {
      if (client.usable) {
        try {
          await client.logout()
        } catch {
          client.close()
        }
      } else {
        client.close()
      }
    }
  }

  private async withReferencedMessage<T>(
    credential: NeteaseMailCredential,
    reference: { folder: string; uidValidity: string; uid: number },
    readOnly: boolean,
    operation: (client: ReturnType<ImapClientFactory['create']>, message: FetchMessageObject) => Promise<T>
  ): Promise<T> {
    return this.withImap(credential, async (client) => {
      const mailbox = await client.mailboxOpen(reference.folder, { readOnly })
      if (mailbox.uidValidity.toString() !== reference.uidValidity) {
        throw new NeteaseMailError('MAIL_REFERENCE_STALE', 'The mail folder changed and this reference is stale.')
      }
      const message = await client.fetchOne(
        reference.uid,
        {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          size: true,
          bodyStructure: true
        },
        { uid: true }
      )
      if (!message) {
        throw new NeteaseMailError('MAIL_MESSAGE_NOT_FOUND', 'The referenced email no longer exists.')
      }
      return operation(client, message)
    })
  }

  private toSummary(folder: string, uidValidity: string, message: FetchMessageObject): MailSummaryDto {
    return {
      messageRef: this.references.encodeMessage({ folder, uidValidity, uid: message.uid }),
      uid: message.uid,
      subject: message.envelope?.subject?.trim() || '(no subject)',
      from: toAddressDtos(message.envelope?.from),
      to: toAddressDtos(message.envelope?.to),
      date: toIsoDate(message.envelope?.date),
      receivedAt: toIsoDate(message.internalDate),
      size: message.size,
      read: message.flags?.has('\\Seen') ?? false,
      starred: message.flags?.has('\\Flagged') ?? false,
      hasAttachments: listAttachments(message.bodyStructure).length > 0
    }
  }
}

function buildProviderSearchCriteria(input: SearchEmailsInput, beforeUid?: number): SearchObject {
  const before = input.before ? new Date(input.before) : undefined
  const rangeEnd = before ?? new Date()
  const since = input.since ? new Date(input.since) : new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1_000)
  if (rangeEnd <= since) {
    throw new NeteaseMailError('MAIL_QUERY_INVALID', 'The search before date must be after the since date.')
  }
  if (rangeEnd.getTime() - since.getTime() > 366 * 24 * 60 * 60 * 1_000) {
    throw new NeteaseMailError('MAIL_QUERY_INVALID', 'The search date range cannot exceed 366 days.')
  }
  const criteria: SearchObject = {
    since,
    ...(before ? { before } : {}),
    ...(input.unreadOnly ? { seen: false } : {}),
    ...(beforeUid ? { uid: `1:${beforeUid - 1}` } : {})
  }
  return criteria
}

function matchesEnvelopeFilters(message: FetchMessageObject, input: SearchEmailsInput): boolean {
  if (input.subject) {
    const subject = normalizeMailSearchText(message.envelope?.subject ?? '')
    if (!subject.includes(normalizeMailSearchText(input.subject))) {
      return false
    }
  }

  if (input.from) {
    const expectedFrom = normalizeMailSearchText(input.from)
    const matchesFrom = (message.envelope?.from ?? []).some((address) =>
      [address.name, address.address]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => normalizeMailSearchText(value).includes(expectedFrom))
    )
    if (!matchesFrom) {
      return false
    }
  }

  return true
}

function normalizeMailSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function toAddressDtos(addresses?: MessageAddressObject[]): MailAddressDto[] {
  return (addresses ?? [])
    .filter((address): address is MessageAddressObject & { address: string } => !!address.address)
    .map((address) => ({
      ...(address.name?.trim() ? { name: address.name.trim() } : {}),
      address: address.address.trim().toLowerCase()
    }))
}

function listAttachments(structure?: MessageStructureObject): MailAttachmentDto[] {
  if (!structure) {
    return []
  }
  const attachments: MailAttachmentDto[] = []
  walkStructure(structure, (node) => {
    const filename = node.dispositionParameters?.filename || node.parameters?.name
    const isAttachment = node.disposition?.toLowerCase() === 'attachment' || !!filename
    if (!isAttachment || !node.part) {
      return
    }
    attachments.push({
      attachmentId: node.part,
      filename: sanitizeFilename(filename || `attachment-${node.part}`),
      contentType: node.type || 'application/octet-stream',
      size: node.size,
      inline: node.disposition?.toLowerCase() === 'inline'
    })
  })
  return attachments
}

function findAttachment(
  structure: MessageStructureObject | undefined,
  attachmentId: string
): MailAttachmentDto | undefined {
  return listAttachments(structure).find((attachment) => attachment.attachmentId === attachmentId)
}

async function downloadPreferredBody(
  client: ReturnType<ImapClientFactory['create']>,
  uid: number,
  structure?: MessageStructureObject
): Promise<{ text: string; truncated: boolean }> {
  const textNodes: MessageStructureObject[] = []
  const htmlNodes: MessageStructureObject[] = []
  if (structure) {
    walkStructure(structure, (node) => {
      if (node.disposition?.toLowerCase() === 'attachment') {
        return
      }
      if (node.type.toLowerCase() === 'text/plain') {
        textNodes.push(node)
      } else if (node.type.toLowerCase() === 'text/html') {
        htmlNodes.push(node)
      }
    })
  }

  const selected = textNodes[0] ?? htmlNodes[0]
  if (!selected) {
    return { text: '', truncated: false }
  }
  const part = selected.part || '1'
  const download = await client.download(uid, part, { uid: true, maxBytes: NETEASE_MAIL_MAX_BODY_BYTES })
  const buffer = await streamToBuffer(download.content)
  const source = buffer.toString('utf8')
  const text =
    selected.type.toLowerCase() === 'text/html'
      ? convert(source, {
          wordwrap: false,
          selectors: [
            { selector: 'img', format: 'skip' },
            { selector: 'script', format: 'skip' },
            { selector: 'style', format: 'skip' }
          ]
        })
      : source
  const normalized = text.replaceAll('\u0000', '').trim()
  return {
    text: normalized.slice(0, NETEASE_MAIL_MAX_BODY_CHARS),
    truncated: buffer.length >= NETEASE_MAIL_MAX_BODY_BYTES || normalized.length > NETEASE_MAIL_MAX_BODY_CHARS
  }
}

function walkStructure(structure: MessageStructureObject, visit: (node: MessageStructureObject) => void): void {
  visit(structure)
  for (const child of structure.childNodes ?? []) {
    walkStructure(child, visit)
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

function toIsoDate(value?: Date | string): string | undefined {
  if (!value) {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .normalize('NFKC')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127 || character === '/' || character === '\\' || character === ':'
        ? '_'
        : character
    })
    .join('')
    .replace(/\.\.+/g, '.')
    .trim()
  return sanitized.slice(0, 180) || 'attachment'
}

function cleanMessageId(value?: string): string | undefined {
  const result = value?.trim()
  return result && result.length <= 998 ? result : undefined
}

function normalizeSmtpAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry]
    }
    if (isAddressRecord(entry) && typeof entry.address === 'string') {
      return [entry.address]
    }
    return []
  })
}

function isAddressRecord(value: unknown): value is { address: unknown } {
  return typeof value === 'object' && value !== null && 'address' in value
}
