import type { FetchMessageObject, ImapFlow, SearchObject } from 'imapflow'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type { WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { ImapClientFactory } from './imap-client.factory.js'
import { MailReferenceService } from './mail-reference.service.js'
import { NeteaseMailService } from './netease-mail.service.js'
import { createNeteaseMailCredential } from './server-presets.js'
import { SmtpClientFactory } from './smtp-client.factory.js'

describe('NeteaseMailService', () => {
  const credential = createNeteaseMailCredential('user@163.com', 'client-auth-code')

  it('anchors a historical before-only search to the requested date', async () => {
    const imap = createImapClient()
    const service = createService(imap.client)

    await service.searchEmails(credential, { before: '2020-06-30T00:00:00Z' })

    expect(imap.search).toHaveBeenCalledWith(
      expect.objectContaining({
        since: new Date('2020-05-31T00:00:00Z'),
        before: new Date('2020-06-30T00:00:00Z')
      }),
      { uid: true }
    )
  })

  it('rejects search windows over 366 days before running IMAP SEARCH', async () => {
    const imap = createImapClient()
    const service = createService(imap.client)

    await expect(
      service.searchEmails(credential, {
        since: '2020-01-01T00:00:00Z',
        before: '2021-01-03T00:00:00Z'
      })
    ).rejects.toThrow('MAIL_QUERY_INVALID')
    expect(imap.search).not.toHaveBeenCalled()
  })

  it('filters subjects locally instead of relying on NetEase IMAP SUBJECT search', async () => {
    const imap = createImapClient({
      messages: [
        createMessage(101, 'Other message', 'other@example.com'),
        createMessage(102, 'XPERT-QQ-SEND-TEST-20260826', '1852749360@qq.com'),
        createMessage(103, 'Newest message', 'newest@example.com')
      ]
    })
    const service = createService(imap.client)

    const result = await service.searchEmails(credential, {
      folder: 'INBOX',
      subject: 'xpert-qq-send-test-20260826',
      limit: 5
    })

    expect(imap.search).toHaveBeenCalledWith(expect.not.objectContaining({ subject: expect.anything() }), {
      uid: true
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ uid: 102, subject: 'XPERT-QQ-SEND-TEST-20260826' })
  })

  it('filters sender display names and addresses locally with Unicode normalization', async () => {
    const imap = createImapClient({
      messages: [
        createMessage(201, 'Account notice', 'safe@service.netease.com', '网易邮箱账号安全'),
        createMessage(202, 'External mail', '1852749360@qq.com', '御剑飞行')
      ]
    })
    const service = createService(imap.client)

    const byName = await service.searchEmails(credential, { from: '网易邮箱账号安全' })
    const byAddress = await service.searchEmails(credential, { from: '1852749360@QQ.COM' })

    expect(imap.search).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ from: expect.anything() }), {
      uid: true
    })
    expect(byName.items.map((item) => item.uid)).toEqual([201])
    expect(byAddress.items.map((item) => item.uid)).toEqual([202])
  })

  it('paginates locally filtered results without duplicates or gaps', async () => {
    const imap = createImapClient({
      messages: [
        createMessage(301, 'Target oldest', 'sender@example.com'),
        createMessage(302, 'Other', 'sender@example.com'),
        createMessage(303, 'Target middle', 'sender@example.com'),
        createMessage(304, 'Other', 'sender@example.com'),
        createMessage(305, 'Target newest', 'sender@example.com')
      ]
    })
    const service = createService(imap.client)

    const firstPage = await service.searchEmails(credential, { subject: 'target', limit: 2 })
    const secondPage = await service.searchEmails(credential, {
      subject: 'target',
      limit: 2,
      cursor: firstPage.nextCursor
    })

    expect(firstPage.items.map((item) => item.uid)).toEqual([305, 303])
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.nextCursor).toBeTruthy()
    expect(secondPage.items.map((item) => item.uid)).toEqual([301])
    expect(secondPage.hasMore).toBe(false)
  })

  it('uses the connected mailbox as From and disables path/URL loading', async () => {
    const smtp = createSmtpTransport()
    smtp.sendMail.mockResolvedValue({
      accepted: ['alice@example.com'],
      rejected: [],
      messageId: '<provider-message@163.com>'
    })
    const service = createService(undefined, smtp.transport)

    const result = await service.sendEmail(
      credential,
      {
        operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
        to: ['alice@example.com'],
        subject: 'Hello',
        text: 'Body'
      },
      createWorkspaceFiles()
    )

    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'user@163.com',
        messageId: '<63bb27ac-8a33-4ca1-baa5-0b309af8215c.xpert@163.com>',
        disableFileAccess: true,
        disableUrlAccess: true
      })
    )
    expect(result).toMatchObject({
      deliveryState: 'accepted',
      messageId: '<provider-message@163.com>',
      accepted: ['alice@example.com']
    })
    expect(smtp.close).toHaveBeenCalled()
  })

  it('maps an SMTP envelope rejection to MAIL_SEND_REJECTED', async () => {
    const smtp = createSmtpTransport()
    smtp.sendMail.mockRejectedValue({ code: 'EENVELOPE', responseCode: 550 })
    const service = createService(undefined, smtp.transport)

    await expect(
      service.sendEmail(
        credential,
        {
          operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
          to: ['alice@example.com'],
          subject: 'Hello',
          text: 'Body'
        },
        createWorkspaceFiles()
      )
    ).rejects.toThrow('MAIL_SEND_REJECTED')
  })

  it('returns unknown for a DATA timeout and does not retry', async () => {
    const smtp = createSmtpTransport()
    smtp.sendMail.mockRejectedValue({ command: 'DATA', code: 'ETIMEDOUT' })
    const service = createService(undefined, smtp.transport)

    const result = await service.sendEmail(
      credential,
      {
        operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
        to: ['alice@example.com'],
        subject: 'Hello',
        text: 'Body'
      },
      createWorkspaceFiles()
    )

    expect(result.deliveryState).toBe('unknown')
    expect(smtp.sendMail).toHaveBeenCalledTimes(1)
  })
})

function createService(
  client?: ImapFlow,
  transport?: Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>
) {
  const imapFactory = Object.create(ImapClientFactory.prototype) as ImapClientFactory
  jest.spyOn(imapFactory, 'create').mockImplementation(() => {
    if (!client) {
      throw new Error('Unexpected IMAP client creation')
    }
    return client
  })
  const smtpFactory = Object.create(SmtpClientFactory.prototype) as SmtpClientFactory
  jest.spyOn(smtpFactory, 'create').mockImplementation(() => {
    if (!transport) {
      throw new Error('Unexpected SMTP transport creation')
    }
    return transport
  })
  return new NeteaseMailService(imapFactory, smtpFactory, new MailReferenceService())
}

function createImapClient(options: { messages?: FetchMessageObject[] } = {}) {
  const messages = options.messages ?? []
  const search = jest.fn().mockImplementation(async (criteria: SearchObject) => {
    const maxUid = parseSearchMaxUid(criteria.uid)
    return messages.map((message) => message.uid).filter((uid) => maxUid === undefined || uid <= maxUid)
  })
  const fetch = jest.fn().mockImplementation((uids: number[]) => fetchMessages(messages, uids))
  const close = jest.fn()
  const client = {
    usable: false,
    connect: jest.fn().mockResolvedValue(undefined),
    close,
    mailboxOpen: jest.fn().mockResolvedValue({ uidValidity: 123n }),
    search,
    fetch
  } as unknown as ImapFlow
  return { client, search, fetch, close }
}

async function* fetchMessages(messages: FetchMessageObject[], uids: number[]) {
  const selected = new Set(uids)
  for (const message of messages) {
    if (selected.has(message.uid)) {
      yield message
    }
  }
}

function createMessage(uid: number, subject: string, address: string, name?: string): FetchMessageObject {
  return {
    seq: uid,
    uid,
    envelope: {
      subject,
      from: [{ ...(name ? { name } : {}), address }],
      to: [{ address: 'user@163.com' }]
    },
    internalDate: new Date('2026-08-26T00:00:00Z'),
    flags: new Set(),
    size: 1_024
  }
}

function parseSearchMaxUid(value: SearchObject['uid']): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = value.match(/^1:(\d+)$/)
  return match ? Number(match[1]) : undefined
}

function createSmtpTransport() {
  const sendMail = jest.fn()
  const close = jest.fn()
  const transport = { sendMail, close } as unknown as Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>
  return { transport, sendMail, close }
}

function createWorkspaceFiles(): Pick<WorkspaceFilesApi, 'readRuntimeBuffer'> {
  return {
    readRuntimeBuffer: jest.fn()
  }
}
