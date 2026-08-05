import { BadRequestException } from '@nestjs/common'
import { XMLValidator } from 'fast-xml-parser'

const DRAWIO_ROOT_PATTERN = /^\s*(?:<\?xml\b[^?]*\?>\s*)?<(mxfile|mxGraphModel)\b/i

export function validateDrawioXml(value: string | null | undefined) {
  const xml = value?.trim() ?? ''
  if (!xml) return null

  if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml)) {
    throw new BadRequestException('Invalid draw.io XML: document type and entity declarations are not allowed. Nothing was saved.')
  }

  const root = DRAWIO_ROOT_PATTERN.exec(xml)?.[1]
  if (!root) {
    throw new BadRequestException('Invalid draw.io XML: expected an <mxfile> or <mxGraphModel> root element. Nothing was saved.')
  }

  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false })
  if (validation !== true) {
    const line = Math.max(1, validation.err.line)
    const column = Math.max(1, validation.err.col)
    const truncated = !xml.endsWith('>') ? ' The XML appears truncated; regenerate the complete document.' : ''
    throw new BadRequestException(
      `Invalid draw.io XML at line ${line}, column ${column}: ${validation.err.msg}.${truncated} Nothing was saved.`
    )
  }

  if (root.toLowerCase() === 'mxfile' && !/<diagram\b/i.test(xml)) {
    throw new BadRequestException('Invalid draw.io XML: <mxfile> must contain at least one <diagram> page. Nothing was saved.')
  }
  if (root.toLowerCase() === 'mxgraphmodel' && !/<root\b/i.test(xml)) {
    throw new BadRequestException('Invalid draw.io XML: <mxGraphModel> must contain a <root> element. Nothing was saved.')
  }

  return xml
}
