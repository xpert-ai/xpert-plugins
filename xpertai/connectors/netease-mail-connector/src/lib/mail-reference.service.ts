import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { NeteaseMailError } from './errors.js'

const messageReferenceSchema = z
  .object({
    v: z.literal(1),
    folder: z.string().trim().min(1).max(512),
    uidValidity: z.string().regex(/^\d+$/),
    uid: z.number().int().positive()
  })
  .strict()

const searchCursorSchema = z
  .object({
    v: z.literal(1),
    folder: z.string().trim().min(1).max(512),
    uidValidity: z.string().regex(/^\d+$/),
    beforeUid: z.number().int().positive()
  })
  .strict()

export type MailMessageReference = {
  v: 1
  folder: string
  uidValidity: string
  uid: number
}

export type MailSearchCursor = {
  v: 1
  folder: string
  uidValidity: string
  beforeUid: number
}

@Injectable()
export class MailReferenceService {
  encodeMessage(input: Omit<MailMessageReference, 'v'>): string {
    return encodeReference(messageReferenceSchema.parse({ v: 1, ...input }))
  }

  decodeMessage(value: string): MailMessageReference {
    const parsed = decodeReference(value, messageReferenceSchema)
    return {
      v: 1,
      folder: requireParsedString(parsed.folder),
      uidValidity: requireParsedString(parsed.uidValidity),
      uid: requireParsedNumber(parsed.uid)
    }
  }

  encodeCursor(input: Omit<MailSearchCursor, 'v'>): string {
    return encodeReference(searchCursorSchema.parse({ v: 1, ...input }))
  }

  decodeCursor(value: string): MailSearchCursor {
    const parsed = decodeReference(value, searchCursorSchema)
    return {
      v: 1,
      folder: requireParsedString(parsed.folder),
      uidValidity: requireParsedString(parsed.uidValidity),
      beforeUid: requireParsedNumber(parsed.beforeUid)
    }
  }
}

function requireParsedString(value: string | undefined): string {
  if (!value) {
    throw new NeteaseMailError('MAIL_REFERENCE_INVALID', 'The mail reference is invalid.')
  }
  return value
}

function requireParsedNumber(value: number | undefined): number {
  if (!value) {
    throw new NeteaseMailError('MAIL_REFERENCE_INVALID', 'The mail reference is invalid.')
  }
  return value
}

function encodeReference(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeReference<T>(value: string, schema: z.ZodType<T>): T {
  if (!value || value.length > 1_024) {
    throw new NeteaseMailError('MAIL_REFERENCE_INVALID', 'The mail reference is invalid.')
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    return schema.parse(parsed)
  } catch (error) {
    throw new NeteaseMailError(
      'MAIL_REFERENCE_INVALID',
      'The mail reference is invalid.',
      error instanceof Error ? { cause: error } : undefined
    )
  }
}
