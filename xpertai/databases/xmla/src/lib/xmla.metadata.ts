import { XMLA_DISCOVER_REQUEST, requireXmlaString, xmlaValueAsNumber, xmlaValueAsString } from './xmla.protocol.js'
import type { XmlaRequestItems, XmlaRow, XmlaRowset, XmlaValue } from './xmla.protocol.js'

export interface XmlaOlapMetadataRequest {
  catalog?: string
  cube?: string
  includeMemberProperties?: boolean
  includeSapVariables?: boolean
}

export interface XmlaOlapMetadataWarning {
  code: string
  message: string
  catalog?: string
  cube?: string
}

export interface XmlaOlapMemberPropertyMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  dataType?: string
  dimensionUniqueName?: string
  hierarchyUniqueName?: string
  levelUniqueName?: string
}

export interface XmlaOlapLevelMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  ordinal?: number
  levelType?: string
  memberProperties: XmlaOlapMemberPropertyMetadata[]
}

type XmlaOlapLevelDiscovery = XmlaOlapLevelMetadata & {
  hierarchyUniqueName?: string
}

export interface XmlaOlapHierarchyMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  dimensionUniqueName: string
  defaultMemberUniqueName?: string
  levels: XmlaOlapLevelMetadata[]
}

export interface XmlaOlapDimensionMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  dimensionType?: string
  ordinal?: number
  hierarchies: XmlaOlapHierarchyMetadata[]
}

export interface XmlaOlapMeasureMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  dataType?: string
  formatString?: string
  unit?: string
  currency?: string
  aggregator?: string
  visible?: boolean
  ordinal?: number
}

export interface XmlaOlapVariableMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  uid?: string
  variableType: 'member' | 'numeric' | 'hierarchy' | 'unknown'
  selectionType: 'value' | 'interval' | 'complex' | 'unknown'
  dataType?: string
  mandatory: boolean
  initialValueAllowed: boolean
  defaultLow?: string | number | null
  defaultHigh?: string | number | null
  defaultLowCaption?: string
  defaultHighCaption?: string
  referenceDimensionUniqueName?: string
  referenceHierarchyUniqueName?: string
  /** Stable hierarchy references for an on-demand member value-help query. */
  valueHelp?: {
    dimensionUniqueName?: string
    hierarchyUniqueName?: string
  }
  ordinal?: number
}

export interface XmlaOlapCubeMetadata {
  catalog: string
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  cubeType?: string
  provider?: string
  dimensions: XmlaOlapDimensionMetadata[]
  measures: XmlaOlapMeasureMetadata[]
  variables: XmlaOlapVariableMetadata[]
}

export interface XmlaOlapCatalogMetadata {
  uniqueName: string
  technicalName: string
  caption?: string
  description?: string
  cubes: XmlaOlapCubeMetadata[]
}

export interface XmlaOlapMetadata {
  catalogs: XmlaOlapCatalogMetadata[]
  warnings: XmlaOlapMetadataWarning[]
}

export type XmlaDiscover = (
  requestType: string,
  options?: {
    properties?: XmlaRequestItems
    restrictions?: XmlaRequestItems
  }
) => Promise<XmlaRowset>

/**
 * Discovers a bounded, stable-name metadata tree for semantic-model import.
 * A request without a cube returns a catalog/cube index; selecting one cube
 * expands its complete multidimensional structure.
 */
export async function discoverXmlaOlapMetadata(
  discover: XmlaDiscover,
  request: XmlaOlapMetadataRequest,
  dataSourceInfo?: string
): Promise<XmlaOlapMetadata> {
  const warnings: XmlaOlapMetadataWarning[] = []
  const properties = (catalog?: string): XmlaRequestItems => ({
    DataSourceInfo: dataSourceInfo || undefined,
    Catalog: catalog
  })
  const catalogRows = request.catalog
    ? [{ CATALOG_NAME: request.catalog }]
    : (await discover(XMLA_DISCOVER_REQUEST.catalogs, { properties: properties() })).rows

  const catalogs = await Promise.all(
    catalogRows.map(async (catalogRow): Promise<XmlaOlapCatalogMetadata> => {
      const catalog = requireXmlaString(catalogRow, 'CATALOG_NAME')
      const cubeRows = (
        await discover(XMLA_DISCOVER_REQUEST.cubes, {
          properties: properties(catalog),
          restrictions: {
            CATALOG_NAME: catalog,
            CUBE_NAME: request.cube
          }
        })
      ).rows
      const cubes = await Promise.all(
        uniqueBy(cubeRows, (row) => requireXmlaString(row, 'CUBE_NAME')).map(async (cubeRow) => {
          const cube = cubeFromRow(catalog, cubeRow, dataSourceInfo)
          if (!request.cube) return cube
          return discoverCubeMetadata(discover, cube, request, properties(catalog), warnings)
        })
      )
      return {
        uniqueName: catalog,
        technicalName: catalog,
        caption: firstText(catalogRow, 'CATALOG_CAPTION', 'DESCRIPTION') ?? catalog,
        description: firstText(catalogRow, 'DESCRIPTION'),
        cubes
      }
    })
  )
  return { catalogs, warnings }
}

async function discoverCubeMetadata(
  discover: XmlaDiscover,
  cube: XmlaOlapCubeMetadata,
  request: XmlaOlapMetadataRequest,
  properties: XmlaRequestItems,
  warnings: XmlaOlapMetadataWarning[]
): Promise<XmlaOlapCubeMetadata> {
  const restrictions = { CATALOG_NAME: cube.catalog, CUBE_NAME: cube.uniqueName }
  const [dimensions, hierarchies, levels, measures] = await Promise.all([
    discover(XMLA_DISCOVER_REQUEST.dimensions, { properties, restrictions }),
    discover(XMLA_DISCOVER_REQUEST.hierarchies, { properties, restrictions }),
    discover(XMLA_DISCOVER_REQUEST.levels, { properties, restrictions }),
    discover(XMLA_DISCOVER_REQUEST.measures, { properties, restrictions })
  ])
  const memberProperties =
    request.includeMemberProperties === false
      ? []
      : await optionalRows(
          discover,
          XMLA_DISCOVER_REQUEST.memberProperties,
          properties,
          restrictions,
          warnings,
          'XMLA_MEMBER_PROPERTIES_UNAVAILABLE',
          cube
        )
  const variables =
    request.includeSapVariables === false
      ? []
      : await optionalRows(
          discover,
          XMLA_DISCOVER_REQUEST.sapVariables,
          properties,
          restrictions,
          warnings,
          'SAP_VARIABLES_UNAVAILABLE',
          cube
        )

  const propertyMetadata = memberProperties.map(memberPropertyFromRow)
  const levelMetadata = levels.rows.map((row) => levelFromRow(row, propertyMetadata))
  const hierarchyMetadata = hierarchies.rows.map((row) => hierarchyFromRow(row, levelMetadata))
  return {
    ...cube,
    dimensions: dimensions.rows
      .filter((row) => !isMeasuresDimension(row))
      .map((row) => dimensionFromRow(row, hierarchyMetadata)),
    measures: measures.rows.map(measureFromRow),
    variables: variables.map(variableFromRow)
  }
}

async function optionalRows(
  discover: XmlaDiscover,
  requestType: string,
  properties: XmlaRequestItems,
  restrictions: XmlaRequestItems,
  warnings: XmlaOlapMetadataWarning[],
  code: string,
  cube: XmlaOlapCubeMetadata
): Promise<XmlaRow[]> {
  try {
    return (await discover(requestType, { properties, restrictions })).rows
  } catch (error: unknown) {
    warnings.push({
      code,
      message: error instanceof Error ? error.message : `XMLA request ${requestType} is unavailable`,
      catalog: cube.catalog,
      cube: cube.uniqueName
    })
    return []
  }
}

function cubeFromRow(catalog: string, row: XmlaRow, provider?: string): XmlaOlapCubeMetadata {
  const uniqueName = requireXmlaString(row, 'CUBE_NAME')
  return {
    catalog,
    uniqueName,
    technicalName: firstText(row, 'CUBE_UNIQUE_NAME', 'CUBE_NAME') ?? uniqueName,
    caption: firstText(row, 'CUBE_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    cubeType: firstText(row, 'CUBE_TYPE'),
    provider,
    dimensions: [],
    measures: [],
    variables: []
  }
}

function dimensionFromRow(row: XmlaRow, hierarchies: XmlaOlapHierarchyMetadata[]): XmlaOlapDimensionMetadata {
  const uniqueName = firstText(row, 'DIMENSION_UNIQUE_NAME', 'DIMENSION_NAME') ?? ''
  return {
    uniqueName,
    technicalName: firstText(row, 'DIMENSION_NAME') ?? uniqueName,
    caption: firstText(row, 'DIMENSION_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    dimensionType: scalarText(row.DIMENSION_TYPE),
    ordinal: firstNumber(row, 'DIMENSION_ORDINAL'),
    hierarchies: hierarchies.filter((hierarchy) => hierarchy.dimensionUniqueName === uniqueName)
  }
}

function hierarchyFromRow(row: XmlaRow, levels: XmlaOlapLevelDiscovery[]): XmlaOlapHierarchyMetadata {
  const uniqueName = firstText(row, 'HIERARCHY_UNIQUE_NAME', 'HIERARCHY_NAME') ?? ''
  const dimensionUniqueName = firstText(row, 'DIMENSION_UNIQUE_NAME') ?? ''
  return {
    uniqueName,
    technicalName: firstText(row, 'HIERARCHY_NAME') ?? uniqueName,
    caption: firstText(row, 'HIERARCHY_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    dimensionUniqueName,
    defaultMemberUniqueName: firstText(row, 'DEFAULT_MEMBER'),
    levels: levels
      .filter((level) => level.hierarchyUniqueName === uniqueName)
      .map(({ hierarchyUniqueName: _hierarchyUniqueName, ...level }) => level)
  }
}

function levelFromRow(row: XmlaRow, properties: XmlaOlapMemberPropertyMetadata[]): XmlaOlapLevelDiscovery {
  const uniqueName = firstText(row, 'LEVEL_UNIQUE_NAME', 'LEVEL_NAME') ?? ''
  const hierarchyUniqueName = firstText(row, 'HIERARCHY_UNIQUE_NAME')
  return {
    uniqueName,
    technicalName: firstText(row, 'LEVEL_NAME') ?? uniqueName,
    caption: firstText(row, 'LEVEL_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    ordinal: firstNumber(row, 'LEVEL_NUMBER', 'LEVEL_ORDINAL'),
    levelType: scalarText(row.LEVEL_TYPE),
    memberProperties: properties.filter(
      (property) =>
        property.levelUniqueName === uniqueName ||
        (!property.levelUniqueName && property.hierarchyUniqueName === hierarchyUniqueName)
    ),
    hierarchyUniqueName
  }
}

function memberPropertyFromRow(row: XmlaRow): XmlaOlapMemberPropertyMetadata {
  const uniqueName = firstText(row, 'PROPERTY_UNIQUE_NAME', 'PROPERTY_NAME') ?? ''
  return {
    uniqueName,
    technicalName: firstText(row, 'PROPERTY_NAME') ?? uniqueName,
    caption: firstText(row, 'PROPERTY_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    dataType: scalarText(row.DATA_TYPE),
    dimensionUniqueName: firstText(row, 'DIMENSION_UNIQUE_NAME'),
    hierarchyUniqueName: firstText(row, 'HIERARCHY_UNIQUE_NAME'),
    levelUniqueName: firstText(row, 'LEVEL_UNIQUE_NAME')
  }
}

function measureFromRow(row: XmlaRow): XmlaOlapMeasureMetadata {
  const uniqueName = firstText(row, 'MEASURE_UNIQUE_NAME', 'MEASURE_NAME') ?? ''
  return {
    uniqueName,
    technicalName: firstText(row, 'MEASURE_NAME') ?? uniqueName,
    caption: firstText(row, 'MEASURE_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    dataType: scalarText(row.DATA_TYPE),
    formatString: firstText(row, 'DEFAULT_FORMAT_STRING', 'FORMAT_STRING'),
    unit: firstText(row, 'MEASURE_UNITS', 'UNIT', 'UNIT_OF_MEASURE'),
    currency: firstText(row, 'MEASURE_CURRENCY', 'CURRENCY'),
    aggregator: scalarText(row.MEASURE_AGGREGATOR),
    visible: firstBoolean(row, 'MEASURE_IS_VISIBLE', 'VISIBLE'),
    ordinal: firstNumber(row, 'MEASURE_ORDINAL')
  }
}

function variableFromRow(row: XmlaRow): XmlaOlapVariableMetadata {
  const uniqueName = firstText(row, 'VARIABLE_NAME') ?? ''
  const entryType = firstNumber(row, 'VARIABLE_ENTRY_TYPE') ?? symbolicEntryType(row.VARIABLE_ENTRY_TYPE)
  const referenceDimensionUniqueName = firstText(row, 'REFERENCE_DIMENSION')
  const referenceHierarchyUniqueName = firstText(row, 'REFERENCE_HIERARCHY')
  return {
    uniqueName,
    technicalName: uniqueName,
    caption: firstText(row, 'VARIABLE_CAPTION') ?? uniqueName,
    description: firstText(row, 'DESCRIPTION'),
    uid: firstText(row, 'VARIABLE_UID'),
    variableType: variableType(row.VARIABLE_TYPE),
    selectionType: selectionType(row.VARIABLE_SELECTION_TYPE),
    dataType: scalarText(row.DATA_TYPE),
    mandatory: entryType === 1 || entryType === 2,
    initialValueAllowed: entryType !== 2,
    defaultLow: scalar(row.DEFAULT_LOW),
    defaultHigh: scalar(row.DEFAULT_HIGH),
    defaultLowCaption: firstText(row, 'DEFAULT_LOW_CAP'),
    defaultHighCaption: firstText(row, 'DEFAULT_HIGH_CAP'),
    referenceDimensionUniqueName,
    referenceHierarchyUniqueName,
    valueHelp:
      referenceDimensionUniqueName || referenceHierarchyUniqueName
        ? {
            dimensionUniqueName: referenceDimensionUniqueName,
            hierarchyUniqueName: referenceHierarchyUniqueName
          }
        : undefined,
    ordinal: firstNumber(row, 'VARIABLE_ORDINAL')
  }
}

function variableType(value: XmlaValue | undefined): XmlaOlapVariableMetadata['variableType'] {
  const numeric = numericOrSymbolic(value, {
    SAP_VAR_TYPE_MEMBER: 1,
    SAP_VAR_TYPE_NUMERIC: 2,
    SAP_VAR_TYPE_HIERARCHY: 3
  })
  return numeric === 1 ? 'member' : numeric === 2 ? 'numeric' : numeric === 3 ? 'hierarchy' : 'unknown'
}

function selectionType(value: XmlaValue | undefined): XmlaOlapVariableMetadata['selectionType'] {
  const numeric = numericOrSymbolic(value, {
    SAP_VAR_SEL_TYPE_VALUE: 1,
    SAP_VAR_SEL_TYPE_INTERVAL: 2,
    SAP_VAR_SEL_TYPE_COMPLEX: 3
  })
  return numeric === 1 ? 'value' : numeric === 2 ? 'interval' : numeric === 3 ? 'complex' : 'unknown'
}

function symbolicEntryType(value: XmlaValue | undefined): number | undefined {
  return numericOrSymbolic(value, {
    SAP_VAR_INPUT_TYPE_OPTIONAL: 0,
    SAP_VAR_INPUT_TYPE_MANDATORY: 1,
    SAP_VAR_INPUT_TYPE_MANDATORY_NOT_INITIAL: 2
  })
}

function numericOrSymbolic(value: XmlaValue | undefined, symbols: Record<string, number>): number | undefined {
  const number = xmlaValueAsNumber({ value }, 'value')
  if (number !== undefined) return number
  const text = xmlaValueAsString({ value }, 'value')?.trim().toUpperCase()
  return text ? symbols[text] : undefined
}

function isMeasuresDimension(row: XmlaRow): boolean {
  return (
    xmlaValueAsNumber(row, 'DIMENSION_TYPE') === 2 || xmlaValueAsString(row, 'DIMENSION_UNIQUE_NAME') === '[Measures]'
  )
}

function firstText(row: XmlaRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = xmlaValueAsString(row, key)?.trim()
    if (value) return value
  }
  return undefined
}

function firstNumber(row: XmlaRow, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = xmlaValueAsNumber(row, key)
    if (value !== undefined) return value
  }
  return undefined
}

function firstBoolean(row: XmlaRow, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = row[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value !== 'string') continue

    const text = value.trim().toLowerCase()
    if (!text) continue
    if (text === 'true' || text === 'yes' || text === 'y' || text === 'x' || text === 'on') return true
    if (text === 'false' || text === 'no' || text === 'n' || text === 'off') return false

    const numeric = Number(text)
    if (Number.isFinite(numeric)) return numeric !== 0
  }
  return undefined
}

function scalar(value: XmlaValue | undefined): string | number | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return undefined
}

function scalarText(value: XmlaValue | undefined): string | undefined {
  if (value === undefined || value === null || Array.isArray(value)) return undefined
  return String(value)
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return Array.from(new Map(values.map((value) => [key(value), value])).values())
}
