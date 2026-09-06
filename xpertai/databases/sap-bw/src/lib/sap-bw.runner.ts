import { requireXmlaString, XMLARunner, xmlaValueAsNumber, xmlaValueAsString } from '@xpert-ai/plugin-xmla'
import type { XmlaAdapterOptions, XmlaDiscoverOptions, XmlaRow, XmlaValue } from '@xpert-ai/plugin-xmla'
import type { IColumnDef, IDSSchema } from '@xpert-ai/plugin-sdk'

export const SAP_BW_TYPE = 'sapbw'
export const SAP_BW_VARIABLES_REQUEST = 'SAP_VARIABLES'

export interface SapBwAdapterOptions extends XmlaAdapterOptions {
  catalog_discovery?: 'catalogs' | 'cubes'
}

type XmlaRunnerExtraArguments = ConstructorParameters<typeof XMLARunner> extends [XmlaAdapterOptions?, ...infer Args]
  ? Args
  : never

export interface SapBwVariable {
  catalogName: string
  cubeName: string
  name: string
  label: string
  guid?: string
  variableType?: number
  dataType?: string
  maxLength?: number
  ordinal?: number
  processingType?: number
  selectionType?: number
  entryType?: number
  referenceDimension?: string
  referenceHierarchy?: string
  defaultLow?: string
  defaultHigh?: string
  description?: string
}

export class SapBwRunner extends XMLARunner {
  static override readonly type: string = SAP_BW_TYPE

  override readonly name = 'SAP BW (OLAP)'
  override readonly type = SAP_BW_TYPE
  declare readonly options: SapBwAdapterOptions

  constructor(options?: SapBwAdapterOptions, ...args: XmlaRunnerExtraArguments) {
    super(options, ...args)
  }

  override get configurationSchema(): Record<string, unknown> {
    const schema = super.configurationSchema
    return {
      ...schema,
      properties: {
        ...this.configurationProperties(),
        catalog_discovery: {
          type: 'string',
          title: 'Catalog discovery',
          description: 'Use cube catalogs when the SAP BW DBSCHEMA_CATALOGS rowset is too slow.',
          enum: ['catalogs', 'cubes'],
          default: 'catalogs'
        }
      }
    }
  }

  override async getCatalogs(): Promise<IDSSchema[]> {
    if (this.options.catalog_discovery !== 'cubes') {
      return super.getCatalogs()
    }
    // MDSCHEMA_CUBES supplies authoritative catalog names without enumerating
    // providers that expose no accessible MDX cubes for the current user.
    const schemas = await this.getSchema()
    return schemas.map(({ name, catalog, schema, label, type }) => ({ name, catalog, schema, label, type }))
  }

  private configurationProperties(): object {
    const properties = super.configurationSchema.properties
    return typeof properties === 'object' && properties !== null ? properties : {}
  }

  async discoverVariables(
    catalog: string,
    cube: string,
    options: Pick<XmlaDiscoverOptions, 'headers'> = {}
  ): Promise<SapBwVariable[]> {
    const result = await this.discover(SAP_BW_VARIABLES_REQUEST, {
      properties: { Catalog: catalog },
      restrictions: {
        CATALOG_NAME: catalog,
        CUBE_NAME: cube
      },
      headers: options.headers
    })
    return result.rows.map(toSapBwVariable)
  }

  protected override measureColumnType(dataType: XmlaValue | undefined): IColumnDef['type'] {
    if (typeof dataType === 'string') {
      const mapped = SAP_BW_COLUMN_TYPES[dataType.toUpperCase()]
      if (mapped) {
        return mapped
      }
    }
    return super.measureColumnType(dataType)
  }
}

const SAP_BW_COLUMN_TYPES: Readonly<Record<string, IColumnDef['type']>> = {
  ACCP: 'string',
  CHAR: 'string',
  CLNT: 'number',
  CUKY: 'string',
  CURR: 'number',
  D16D: 'number',
  D16R: 'number',
  D16S: 'number',
  D34D: 'number',
  D34R: 'number',
  D34S: 'number',
  DATS: 'timestamp',
  DEC: 'number',
  FLTP: 'number',
  INT1: 'number',
  INT2: 'number',
  INT4: 'number',
  LANG: 'string',
  LCHR: 'string',
  LRAW: 'string',
  NUMC: 'string',
  PREC: 'string',
  QUAN: 'number',
  RAW: 'number',
  RSTR: 'string',
  SSTR: 'string',
  STRG: 'string',
  TIMS: 'timestamp',
  UNIT: 'string',
  VARC: 'string'
}

function toSapBwVariable(row: XmlaRow): SapBwVariable {
  return {
    catalogName: requireXmlaString(row, 'CATALOG_NAME'),
    cubeName: requireXmlaString(row, 'CUBE_NAME'),
    name: requireXmlaString(row, 'VARIABLE_NAME'),
    label: xmlaValueAsString(row, 'VARIABLE_CAPTION') ?? requireXmlaString(row, 'VARIABLE_NAME'),
    guid: xmlaValueAsString(row, 'VARIABLE_GUID'),
    variableType: xmlaValueAsNumber(row, 'VARIABLE_TYPE'),
    dataType: xmlaValueAsString(row, 'DATA_TYPE'),
    maxLength: xmlaValueAsNumber(row, 'MAX_LENGTH'),
    ordinal: xmlaValueAsNumber(row, 'VARIABLE_ORDINAL'),
    processingType: xmlaValueAsNumber(row, 'VARIABLE_PROCESSING_TYPE'),
    selectionType: xmlaValueAsNumber(row, 'VARIABLE_SELECTION_TYPE'),
    entryType: xmlaValueAsNumber(row, 'VARIABLE_ENTRY_TYPE'),
    referenceDimension: xmlaValueAsString(row, 'REFERENCE_DIMENSION'),
    referenceHierarchy: xmlaValueAsString(row, 'REFERENCE_HIERARCHY'),
    defaultLow: xmlaValueAsString(row, 'DEFAULT_LOW'),
    defaultHigh: xmlaValueAsString(row, 'DEFAULT_HIGH'),
    description: xmlaValueAsString(row, 'DESCRIPTION')
  }
}
