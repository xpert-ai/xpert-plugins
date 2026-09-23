import type { WorkspaceFileLocator, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { NeteaseMailConfirmationStore } from './confirmation-store.js'
import { defineNeteaseMailAgentTool, type NeteaseMailAgentTool } from './define-agent-tool.js'
import { NeteaseMailError } from './errors.js'
import { NeteaseMailService } from './netease-mail.service.js'
import type { MailAddressDto, MailSendAttachment, MailSendInput, NeteaseMailCredential } from './types.js'
import {
  downloadEmailAttachmentSchema,
  getEmailSchema,
  listMailFoldersSchema,
  type DownloadEmailAttachmentToolInput,
  type GetEmailToolInput,
  type ListMailFoldersToolInput,
  type MailFileDescriptorInput,
  type ReplyEmailToolInput,
  type SearchEmailsToolInput,
  type SendEmailToolInput,
  type SetEmailFlagsToolInput,
  replyEmailSchema,
  searchEmailsSchema,
  sendEmailSchema,
  setEmailFlagsSchema
} from './tool-schemas.js'

export type NeteaseMailToolRuntime = {
  mailService: NeteaseMailService
  confirmationStore: NeteaseMailConfirmationStore
  getConnection: () => Promise<{ connectorId: string; credential: NeteaseMailCredential }>
  getWorkspaceFiles: () => Pick<WorkspaceFilesApi, 'readRuntimeBuffer' | 'writeRuntimeBuffer'>
}

export function createNeteaseMailTools(runtime: NeteaseMailToolRuntime): NeteaseMailAgentTool[] {
  return [
    defineNeteaseMailAgentTool<ListMailFoldersToolInput>(
      async (input) => runtime.mailService.listFolders((await runtime.getConnection()).credential, input),
      {
        name: 'list_netease_mail_folders',
        description: 'List bounded NetEase Mail folders with message and unread counts. This is read-only.',
        schema: listMailFoldersSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<SearchEmailsToolInput>(
      async (input) => runtime.mailService.searchEmails((await runtime.getConnection()).credential, input),
      {
        name: 'search_netease_emails',
        description:
          'Search one NetEase Mail folder and return a bounded newest-first page of email summaries. Subject and sender values are case-insensitive substring filters; pass only the intended value, without surrounding instructions. Use nextCursor for the next page. This is read-only.',
        schema: searchEmailsSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<GetEmailToolInput>(
      async (input) => runtime.mailService.getEmail((await runtime.getConnection()).credential, input.messageRef),
      {
        name: 'get_netease_email',
        description:
          'Read one exact NetEase email using a messageRef returned by search_netease_emails. Returns bounded plain text and attachment metadata without downloading attachments.',
        schema: getEmailSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<DownloadEmailAttachmentToolInput>(
      async (input) =>
        runtime.mailService.downloadAttachment(
          (await runtime.getConnection()).credential,
          input.messageRef,
          input.attachmentId,
          runtime.getWorkspaceFiles()
        ),
      {
        name: 'download_netease_email_attachment',
        description:
          'Download one attachment discovered by get_netease_email into the current Xpert workspace. The attachment is limited to 20 MiB.',
        schema: downloadEmailAttachmentSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<SendEmailToolInput>(
      async (input) => {
        const connection = await runtime.getConnection()
        const sendInput: MailSendInput = {
          operationId: requireToolString(input.operationId, 'operationId'),
          to: input.to ?? [],
          cc: input.cc,
          bcc: input.bcc,
          subject: requireToolString(input.subject, 'subject'),
          text: input.text,
          html: input.html,
          attachments: toSendAttachments(input.attachments)
        }
        return executeConfirmedSend(runtime, connection, 'send', sendInput, {
          confirmationHandle: input.confirmation_handle,
          confirmed: input.confirmed
        })
      },
      {
        name: 'send_netease_email',
        description:
          'Prepare or send an external email from the connected NetEase mailbox. First call without confirmation fields returns confirmation_required. Call again only after structured user confirmation with identical arguments plus confirmation_handle and confirmed=true. Never retry deliveryState=unknown.',
        schema: sendEmailSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<ReplyEmailToolInput>(
      async (input) => {
        const connection = await runtime.getConnection()
        const credential = connection.credential
        const original = await runtime.mailService.getEmail(credential, input.messageRef)
        const primary = original.replyTo.length ? original.replyTo : original.from
        const to = uniqueAddresses(primary, credential.email)
        if (!to.length) {
          throw new NeteaseMailError('MAIL_SEND_REJECTED', 'The original email does not contain a reply address.')
        }

        const replyAllTo = input.replyAll
          ? uniqueStrings([...to, ...uniqueAddresses(original.to, credential.email)])
          : to
        const cc = input.replyAll
          ? uniqueStrings(uniqueAddresses(original.cc, credential.email)).filter(
              (address) => !replyAllTo.includes(address)
            )
          : undefined
        const references = uniqueStrings([original.inReplyTo, original.messageId].filter(isDefinedString))
        const sendInput: MailSendInput = {
          operationId: requireToolString(input.operationId, 'operationId'),
          to: replyAllTo,
          ...(cc?.length ? { cc } : {}),
          subject: buildReplySubject(original.subject),
          text: input.text,
          html: input.html,
          attachments: toSendAttachments(input.attachments),
          inReplyTo: original.messageId,
          ...(references.length ? { references } : {})
        }

        return executeConfirmedSend(runtime, connection, 'reply', sendInput, {
          confirmationHandle: input.confirmation_handle,
          confirmed: input.confirmed
        })
      },
      {
        name: 'reply_netease_email',
        description:
          'Prepare or send a reply while preserving thread headers. First call returns confirmation_required; send only after structured user confirmation with the same arguments plus confirmation_handle and confirmed=true.',
        schema: replyEmailSchema,
        verboseParsingErrors: true
      }
    ),
    defineNeteaseMailAgentTool<SetEmailFlagsToolInput>(
      async (input) =>
        runtime.mailService.setFlags((await runtime.getConnection()).credential, input.messageRef, {
          read: input.read,
          starred: input.starred
        }),
      {
        name: 'set_netease_email_flags',
        description: 'Set read/unread or starred state for one exact NetEase email. This mutates mailbox state.',
        schema: setEmailFlagsSchema,
        verboseParsingErrors: true
      }
    )
  ]
}

async function executeConfirmedSend(
  runtime: NeteaseMailToolRuntime,
  connection: { connectorId: string; credential: NeteaseMailCredential },
  operation: 'send' | 'reply',
  input: MailSendInput,
  confirmation: { confirmationHandle?: string; confirmed?: true }
) {
  const argumentsForConfirmation = toConfirmationArguments(input)
  if (!confirmation.confirmationHandle) {
    const created = runtime.confirmationStore.create({
      connectorId: connection.connectorId,
      operation,
      arguments: argumentsForConfirmation
    })
    return {
      status: 'confirmation_required' as const,
      confirmationHandle: created.handle,
      expiresAt: created.expiresAt,
      preview: {
        operation,
        from: connection.credential.email,
        to: input.to,
        cc: input.cc ?? [],
        bcc: input.bcc ?? [],
        subject: input.subject,
        bodyPreview: (input.text || input.html || '').slice(0, 2_000),
        attachments: (input.attachments ?? []).map((attachment) => attachment.filename || 'workspace file')
      }
    }
  }
  if (confirmation.confirmed !== true) {
    throw new NeteaseMailError('MAIL_CONFIRMATION_INVALID', 'Explicit structured user confirmation is required.')
  }
  runtime.confirmationStore.take({
    handle: confirmation.confirmationHandle,
    connectorId: connection.connectorId,
    operation,
    arguments: argumentsForConfirmation
  })
  return runtime.mailService.sendEmail(connection.credential, input, runtime.getWorkspaceFiles())
}

function toConfirmationArguments(input: MailSendInput): Record<string, unknown> {
  return {
    operationId: input.operationId,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    text: input.text ?? null,
    html: input.html ?? null,
    attachments: (input.attachments ?? []).map((attachment) => ({
      locator: attachment.locator,
      filename: attachment.filename ?? null
    })),
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? []
  }
}

function requireToolString(value: string | undefined, name: string): string {
  if (!value) {
    throw new NeteaseMailError('MAIL_RUNTIME_UNAVAILABLE', `Validated tool field '${name}' is missing.`)
  }
  return value
}

function toSendAttachments(files?: MailFileDescriptorInput[]): MailSendAttachment[] | undefined {
  if (!files?.length) {
    return undefined
  }
  return files.map((file) => ({
    locator: toWorkspaceFileLocator(file),
    ...(file.originalName || file.name ? { filename: file.originalName || file.name } : {})
  }))
}

function toWorkspaceFileLocator(file: MailFileDescriptorInput): WorkspaceFileLocator {
  const path = file.path || file.workspacePath || file.filePath || file.fileRef?.workspacePath || file.fileRef?.filePath
  if (!path) {
    throw new NeteaseMailError('MAIL_RUNTIME_UNAVAILABLE', 'A valid Xpert workspace file reference is required.')
  }
  return {
    path,
    originalName: file.originalName || file.name,
    mimeType: file.mimeType,
    size: file.size
  }
}

function uniqueAddresses(addresses: MailAddressDto[], ownEmail: string): string[] {
  return uniqueStrings(
    addresses.map((address) => address.address.toLowerCase()).filter((address) => address !== ownEmail.toLowerCase())
  )
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function isDefinedString(value: string | undefined): value is string {
  return typeof value === 'string' && !!value
}

function buildReplySubject(subject: string): string {
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`
}
