import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { assetSchema, limits, type AssetDescriptor } from './resource-contract'
import { parseLibraryJson, sha256 } from './resource-json'

const svgTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'use', 'symbol'])
function validateSvg(text: string) {
  if (/<!|<\?/i.test(text)) throw new Error('LIBRARY_SVG_UNSAFE')
  const fragment = parseFragment(text)
  const elements = fragment.childNodes.filter(n => 'tagName' in n)
  if (elements.length !== 1 || !('tagName' in elements[0]) || elements[0].tagName !== 'svg') throw new Error('LIBRARY_SVG_UNSAFE')
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node) {
      if (node.namespaceURI !== 'http://www.w3.org/2000/svg' || !svgTags.has(node.tagName)) throw new Error('LIBRARY_SVG_UNSAFE')
      for (const attr of node.attrs) {
        if (attr.name === 'xmlns' && attr.value === 'http://www.w3.org/2000/svg') continue
        if (/^on/i.test(attr.name) || attr.name === 'style' || /(?:javascript|data|https?|file):|[\\\u0000-\u001f]/i.test(attr.value)) throw new Error('LIBRARY_SVG_UNSAFE')
        if (attr.name === 'href' && !/^#[A-Za-z][\w.-]*$/.test(attr.value)) throw new Error('LIBRARY_SVG_UNSAFE')
        if (/url\s*\(/i.test(attr.value) && !/^url\(#[A-Za-z][\w.-]*\)$/.test(attr.value)) throw new Error('LIBRARY_SVG_UNSAFE')
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(fragment)
}

/** Attachment storage grants no execution authority. HTML still needs Dashboard preflight before use. */
export function validateAssetContent(bytes: Buffer, mimeType: AssetDescriptor['mimeType']) {
  if (!bytes.length || bytes.length > limits.assetBytes) throw new Error('LIBRARY_ASSET_LIMIT')
  if (mimeType === 'image/png') {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('LIBRARY_ASSET_TYPE')
  } else if (mimeType === 'image/jpeg') {
    if (!bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) throw new Error('LIBRARY_ASSET_TYPE')
  } else if (mimeType === 'image/webp') {
    if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('LIBRARY_ASSET_TYPE')
  } else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.includes('\0')) throw new Error('LIBRARY_ASSET_TYPE')
    if (mimeType === 'image/svg+xml') validateSvg(text)
    if (mimeType === 'application/json') parseLibraryJson(bytes, limits.assetBytes)
    if (mimeType === 'text/html' && !/<(?:!doctype html|html|body|div|main|section)[\s>]/i.test(text)) throw new Error('LIBRARY_ASSET_TYPE')
  }
}
export function validateAsset(descriptor: AssetDescriptor, bytes: Buffer) {
  descriptor = assetSchema.parse(descriptor)
  if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256) throw new Error('LIBRARY_ASSET_INTEGRITY')
  const extension = descriptor.fileName.split('.').pop()?.toLowerCase()
  const extensions: Record<AssetDescriptor['mimeType'], string[]> = {
    'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/svg+xml': ['svg'],
    'application/json': ['json'], 'text/csv': ['csv', 'tsv'], 'text/html': ['html', 'htm'], 'text/plain': ['txt', 'md']
  }
  if (!extension || !extensions[descriptor.mimeType].includes(extension)) throw new Error('LIBRARY_ASSET_TYPE')
  validateAssetContent(bytes, descriptor.mimeType)
}
