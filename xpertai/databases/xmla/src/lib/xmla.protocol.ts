import { DOMParser } from '@xmldom/xmldom'
import type { Document, Element, Node } from '@xmldom/xmldom'
import type { IColumnDef } from '@xpert-ai/plugin-sdk'

const SOAP_ENVELOPE_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/'
const SOAP_ENCODING_NAMESPACE = 'http://schemas.xmlsoap.org/soap/encoding/'
const XMLA_NAMESPACE = 'urn:schemas-microsoft-com:xml-analysis'
const XMLA_ROWSET_NAMESPACE = `${XMLA_NAMESPACE}:rowset`
const XML_SCHEMA_NAMESPACE = 'http://www.w3.org/2001/XMLSchema'
const XML_SCHEMA_INSTANCE_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance'
const XML_SQL_NAMESPACE = 'urn:schemas-microsoft-com:xml-sql'

const XML_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/
const ENCODED_XMLA_NAME_PATTERN = /_x([0-9A-Fa-f]{4})_/g

const NUMERIC_XML_TYPES = new Set([
  'byte',
  'decimal',
  'double',
  'float',
  'int',
  'integer',
  'long',
  'negativeInteger',
  'nonNegativeInteger',
  'nonPositiveInteger',
  'positiveInteger',
  'short',
  'unsignedByte',
  'unsignedInt',
  'unsignedLong',
  'unsignedShort'
])

const TIMESTAMP_XML_TYPES = new Set(['date', 'dateTime', 'gDay', 'gMonth', 'gMonthDay', 'gYear', 'gYearMonth', 'time'])

export const XMLA_DISCOVER_REQUEST = {
  dataSources: 'DISCOVER_DATASOURCES',
  properties: 'DISCOVER_PROPERTIES',
  schemaRowsets: 'DISCOVER_SCHEMA_ROWSETS',
  enumerators: 'DISCOVER_ENUMERATORS',
  keywords: 'DISCOVER_KEYWORDS',
  literals: 'DISCOVER_LITERALS',
  catalogs: 'DBSCHEMA_CATALOGS',
  columns: 'DBSCHEMA_COLUMNS',
  providerTypes: 'DBSCHEMA_PROVIDER_TYPES',
  schemata: 'DBSCHEMA_SCHEMATA',
  tables: 'DBSCHEMA_TABLES',
  tablesInfo: 'DBSCHEMA_TABLES_INFO',
  actions: 'MDSCHEMA_ACTIONS',
  cubes: 'MDSCHEMA_CUBES',
  dimensions: 'MDSCHEMA_DIMENSIONS',
  functions: 'MDSCHEMA_FUNCTIONS',
  hierarchies: 'MDSCHEMA_HIERARCHIES',
  levels: 'MDSCHEMA_LEVELS',
  measures: 'MDSCHEMA_MEASURES',
  members: 'MDSCHEMA_MEMBERS',
  memberProperties: 'MDSCHEMA_PROPERTIES',
  sets: 'MDSCHEMA_SETS'
} as const

export type XmlaDiscoverRequestType = (typeof XMLA_DISCOVER_REQUEST)[keyof typeof XMLA_DISCOVER_REQUEST]

export type XmlaScalar = string | number | boolean | null
export type XmlaValue = XmlaScalar | readonly XmlaScalar[]
export type XmlaRequestValue = Exclude<XmlaScalar, null> | readonly Exclude<XmlaScalar, null>[]

export interface XmlaRequestItems {
  readonly [name: string]: XmlaRequestValue | undefined
}

export interface XmlaRow {
  readonly [fieldName: string]: XmlaValue | undefined
}

export interface XmlaRowset {
  requestType?: string
  fields: IColumnDef[]
  rows: XmlaRow[]
}

export interface XmlaDiscoverEnvelopeOptions {
  properties?: XmlaRequestItems
  restrictions?: XmlaRequestItems
}

export interface XmlaExecuteEnvelopeOptions {
  properties?: XmlaRequestItems
}

interface XmlaFieldDefinition extends IColumnDef {
  xmlName: string
}

export class XmlaSoapFaultError extends Error {
  readonly faultCode?: string
  readonly details: readonly string[]

  constructor(message: string, faultCode?: string, details: readonly string[] = []) {
    super(message)
    this.name = 'XmlaSoapFaultError'
    this.faultCode = faultCode
    this.details = details
  }
}

export function buildXmlaDiscoverEnvelope(requestType: string, options: XmlaDiscoverEnvelopeOptions = {}): string {
  if (!requestType.trim()) {
    throw new Error('XMLA Discover request type is required')
  }

  const properties: XmlaRequestItems = {
    Format: 'Tabular',
    ...options.properties
  }
  const body = [
    '<Discover xmlns="urn:schemas-microsoft-com:xml-analysis"',
    ' SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    `<RequestType>${escapeXml(requestType)}</RequestType>`,
    serializeSoapList('Restrictions', 'RestrictionList', options.restrictions),
    serializeSoapList('Properties', 'PropertyList', properties),
    '</Discover>'
  ].join('')

  return buildSoapEnvelope(body)
}

export function buildXmlaExecuteEnvelope(statement: string, options: XmlaExecuteEnvelopeOptions = {}): string {
  if (!statement.trim()) {
    throw new Error('XMLA Execute statement is required')
  }

  const properties: XmlaRequestItems = {
    Content: 'SchemaData',
    Format: 'Tabular',
    ...options.properties
  }
  const body = [
    '<Execute xmlns="urn:schemas-microsoft-com:xml-analysis"',
    ' SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    '<Command>',
    `<Statement>${escapeXml(statement)}</Statement>`,
    '</Command>',
    serializeSoapList('Properties', 'PropertyList', properties),
    '</Execute>'
  ].join('')

  return buildSoapEnvelope(body)
}

export function parseXmlaRowset(payload: unknown, requestType?: string): XmlaRowset {
  const xml = normalizeXmlPayload(payload)
  if (/<!DOCTYPE/i.test(xml)) {
    throw new Error('XMLA response must not contain a DOCTYPE declaration')
  }

  const document = parseXml(xml)
  throwForXmlaFault(document)

  const definitions = readFieldDefinitions(document)
  const fieldByXmlName = new Map(definitions.map((definition) => [definition.xmlName, definition]))
  const rowElements = findElements(document, 'row').filter(
    (element) =>
      element.namespaceURI === XMLA_ROWSET_NAMESPACE || element.namespaceURI === null || element.namespaceURI === ''
  )
  const rows = rowElements.map((rowElement) => readRow(rowElement, fieldByXmlName))
  const fields = mergeInferredFields(definitions, rows)

  return {
    requestType,
    fields: fields.map(toPublicField),
    rows
  }
}

export function xmlaValueAsString(row: XmlaRow, fieldName: string): string | undefined {
  const value = row[fieldName]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  throw new Error(`XMLA field '${fieldName}' must contain a scalar value`)
}

export function requireXmlaString(row: XmlaRow, fieldName: string): string {
  const value = xmlaValueAsString(row, fieldName)
  if (value === undefined || value === '') {
    throw new Error(`XMLA response is missing '${fieldName}'`)
  }
  return value
}

export function xmlaValueAsNumber(row: XmlaRow, fieldName: string): number | undefined {
  const value = row[fieldName]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  throw new Error(`XMLA field '${fieldName}' must contain a number`)
}

export function xmlaDataTypeToColumnType(dataType: XmlaValue | undefined): IColumnDef['type'] {
  if (typeof dataType === 'number') {
    if ([2, 3, 5, 6, 14, 16, 17, 18, 19, 20, 21, 131].includes(dataType)) {
      return 'number'
    }
    if (dataType === 11) {
      return 'boolean'
    }
    if ([7, 133, 134, 135].includes(dataType)) {
      return 'timestamp'
    }
    return 'string'
  }

  if (typeof dataType !== 'string') {
    return 'string'
  }
  return xmlTypeToColumnType(dataType)
}

function buildSoapEnvelope(body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="${SOAP_ENVELOPE_NAMESPACE}"`,
    ` SOAP-ENV:encodingStyle="${SOAP_ENCODING_NAMESPACE}">`,
    '<SOAP-ENV:Body>',
    body,
    '</SOAP-ENV:Body>',
    '</SOAP-ENV:Envelope>'
  ].join('')
}

function serializeSoapList(containerName: string, listName: string, items?: XmlaRequestItems): string {
  const values = Object.entries(items ?? {}).filter(
    (entry): entry is [string, XmlaRequestValue] => entry[1] !== undefined
  )
  const body = values.map(([name, value]) => serializeSoapValue(name, value)).join('')
  return `<${containerName}><${listName}>${body}</${listName}></${containerName}>`
}

function serializeSoapValue(name: string, value: XmlaRequestValue): string {
  if (!XML_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid XMLA property or restriction name '${name}'`)
  }
  const content = isXmlaRequestArray(value)
    ? value.map((item) => `<Value>${escapeXml(item)}</Value>`).join('')
    : escapeXml(value)
  return `<${name}>${content}</${name}>`
}

function escapeXml(value: Exclude<XmlaScalar, null>): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeXmlPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    if (!payload.trim()) {
      throw new Error('XMLA response body is empty')
    }
    return replaceNullCharacters(payload)
  }
  if (Buffer.isBuffer(payload)) {
    return replaceNullCharacters(payload.toString('utf8'))
  }
  if (payload instanceof Uint8Array) {
    return replaceNullCharacters(Buffer.from(payload).toString('utf8'))
  }
  throw new Error('XMLA response body must be XML text')
}

function parseXml(xml: string): Document {
  return new DOMParser({
    onError(level, message) {
      throw new Error(`Invalid XMLA response (${level}): ${message}`)
    }
  }).parseFromString(xml, 'text/xml')
}

function throwForXmlaFault(document: Document): void {
  const fault = findElements(document, 'Fault')[0]
  const providerErrors = findElements(document, 'Error')
    .filter((element) => element.namespaceURI !== XML_SCHEMA_NAMESPACE)
    .map(
      (element) => element.getAttribute('Description') ?? element.getAttribute('description') ?? textContent(element)
    )
    .filter((message): message is string => Boolean(message))

  if (!fault && providerErrors.length === 0) {
    return
  }

  const faultCode = fault ? descendantText(fault, 'faultcode') ?? providerErrors[0] : providerErrors[0]
  const faultMessage = fault
    ? descendantText(fault, 'faultstring') ?? providerErrors.join('; ')
    : providerErrors.join('; ')
  throw new XmlaSoapFaultError(faultMessage || 'XMLA server returned a SOAP fault', faultCode, providerErrors)
}

function readFieldDefinitions(document: Document): XmlaFieldDefinition[] {
  const namedRowType = findElements(document, 'complexType').find(
    (element) => element.namespaceURI === XML_SCHEMA_NAMESPACE && element.getAttribute('name') === 'row'
  )
  const inlineRowElement = findElements(document, 'element').find(
    (element) =>
      element.namespaceURI === XML_SCHEMA_NAMESPACE &&
      element.getAttribute('name') === 'row' &&
      findElements(element, 'complexType').length > 0
  )
  const container = namedRowType ?? inlineRowElement
  if (!container) {
    return []
  }

  return findElements(container, 'element')
    .filter((element) => element.namespaceURI === XML_SCHEMA_NAMESPACE)
    .flatMap((element, position) => {
      const encodedName =
        element.getAttributeNS(XML_SQL_NAMESPACE, 'field') ??
        element.getAttribute('sql:field') ??
        element.getAttribute('name')
      if (!encodedName || encodedName === 'row') {
        return []
      }
      const name = decodeXmlaName(encodedName)
      const dataType = element.getAttribute('type') || 'xsd:string'
      return [
        {
          xmlName: decodeXmlaName(element.getAttribute('name') ?? encodedName),
          name,
          label: name,
          type: xmlTypeToColumnType(dataType),
          dataType,
          nullable: element.getAttribute('minOccurs') === '0',
          position
        }
      ]
    })
}

function readRow(rowElement: Element, fieldByXmlName: ReadonlyMap<string, XmlaFieldDefinition>): XmlaRow {
  const row: {
    [fieldName: string]: XmlaValue | undefined
  } = {}

  for (const element of childElements(rowElement)) {
    const xmlName = decodeXmlaName(element.localName || element.tagName)
    const definition = fieldByXmlName.get(xmlName)
    const fieldName = definition?.name ?? xmlName
    const value = readElementValue(element, definition?.dataType)
    const previous = row[fieldName]
    if (previous === undefined) {
      row[fieldName] = value
    } else if (isXmlaValueArray(previous)) {
      row[fieldName] = [...previous, value]
    } else {
      row[fieldName] = [previous, value]
    }
  }
  return row
}

function readElementValue(element: Element, dataType = 'xsd:string'): XmlaScalar {
  const isNil =
    element.getAttributeNS(XML_SCHEMA_INSTANCE_NAMESPACE, 'nil') === 'true' ||
    element.getAttribute('xsi:nil') === 'true'
  if (isNil) {
    return null
  }

  const value = textContent(element) ?? ''
  const type = normalizeXmlType(dataType)
  if (type === 'boolean') {
    return value === 'true' || value === '1'
  }
  if (NUMERIC_XML_TYPES.has(type)) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  return value
}

function mergeInferredFields(definitions: XmlaFieldDefinition[], rows: XmlaRow[]): XmlaFieldDefinition[] {
  const fields = [...definitions]
  const existing = new Set(fields.map((field) => field.name))
  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) {
      if (existing.has(name)) {
        continue
      }
      fields.push({
        xmlName: name,
        name,
        label: name,
        type: inferColumnType(value),
        dataType: inferDataType(value),
        nullable: true,
        position: fields.length
      })
      existing.add(name)
    }
  }
  return fields
}

function toPublicField({ name, label, type, dataType, nullable, position, comment }: XmlaFieldDefinition): IColumnDef {
  return {
    name,
    label,
    type,
    dataType,
    nullable,
    position,
    comment
  }
}

function inferColumnType(value: XmlaValue): IColumnDef['type'] {
  if (typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  if (Array.isArray(value)) {
    return 'object'
  }
  return 'string'
}

function inferDataType(value: XmlaValue): string {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'string'
  }
  return typeof value
}

function xmlTypeToColumnType(typeName: string): IColumnDef['type'] {
  const type = normalizeXmlType(typeName)
  if (NUMERIC_XML_TYPES.has(type)) {
    return 'number'
  }
  if (type === 'boolean') {
    return 'boolean'
  }
  if (TIMESTAMP_XML_TYPES.has(type)) {
    return 'timestamp'
  }
  if (type === 'anyType' || type === 'base64Binary' || type === 'hexBinary') {
    return 'object'
  }
  return 'string'
}

function normalizeXmlType(typeName: string): string {
  const separator = typeName.indexOf(':')
  return separator >= 0 ? typeName.slice(separator + 1) : typeName
}

function isXmlaRequestArray(value: XmlaRequestValue): value is readonly Exclude<XmlaScalar, null>[] {
  return Array.isArray(value)
}

function isXmlaValueArray(value: XmlaValue): value is readonly XmlaScalar[] {
  return Array.isArray(value)
}

function replaceNullCharacters(value: string): string {
  return value.split(String.fromCharCode(0)).join('-')
}

function decodeXmlaName(name: string): string {
  return name.replace(ENCODED_XMLA_NAME_PATTERN, (_match, codePoint: string) =>
    String.fromCharCode(Number.parseInt(codePoint, 16))
  )
}

function findElements(node: Node, localName: string): Element[] {
  const result: Element[] = []
  const pending: Node[] = [node]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) {
      continue
    }
    if (isElement(current) && (current.localName || current.tagName.split(':').at(-1)) === localName) {
      result.push(current)
    }
    for (let index = current.childNodes.length - 1; index >= 0; index -= 1) {
      const child = current.childNodes.item(index)
      if (child) {
        pending.push(child)
      }
    }
  }
  return result
}

function childElements(node: Node): Element[] {
  const elements: Element[] = []
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index)
    if (child && isElement(child)) {
      elements.push(child)
    }
  }
  return elements
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function descendantText(node: Node, localName: string): string | undefined {
  const element = findElements(node, localName)[0]
  return element ? textContent(element) : undefined
}

function textContent(node: Node): string | undefined {
  const value = node.textContent?.trim()
  return value || undefined
}
