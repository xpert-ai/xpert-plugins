import {
  XMLARunner,
  XmlaAdapterOptions
} from '@xpert-ai/plugin-xmla'

export const SAP_BW_TYPE = 'sapbw'

export type SapBwAdapterOptions = XmlaAdapterOptions

export class SapBwRunner extends XMLARunner {
  static override readonly type: string = SAP_BW_TYPE

  override readonly name = 'SAP BW (OLAP)'
  override readonly type = SAP_BW_TYPE
}
