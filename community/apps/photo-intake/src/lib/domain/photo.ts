import { createHash } from 'node:crypto'
import { IntakeError, MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from './contracts.js'
import type { PhotoMimeType } from './contracts.js'

export interface DecodedPhoto {
  mimeType: PhotoMimeType
  buffer: Buffer
  sha256: string
}

function isPhotoMimeType(value: string): value is PhotoMimeType {
  return PHOTO_MIME_TYPES.some(type => type === value)
}

/** The declared type must match the file signature, so a renamed file cannot pass as an image. */
function signatureMatches(mimeType: PhotoMimeType, bytes: Buffer) {
  switch (mimeType) {
    case 'image/jpeg':
      return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/webp':
      return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  }
}

/** Decodes and verifies an uploaded `data:` URL. Throws `invalid_photo` for anything else. */
export function decodePhotoDataUrl(dataUrl: string): DecodedPhoto {
  const match = /^data:([a-z/]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || !isPhotoMimeType(match[1])) throw new IntakeError('invalid_photo', 'Only JPEG, PNG or WebP photos are accepted.')
  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) throw new IntakeError('invalid_photo', 'The photo is empty or too large.')
  if (!signatureMatches(mimeType, buffer)) throw new IntakeError('invalid_photo', 'The photo content does not match its type.')
  return { mimeType, buffer, sha256: createHash('sha256').update(buffer).digest('hex') }
}

export function toDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`
}
