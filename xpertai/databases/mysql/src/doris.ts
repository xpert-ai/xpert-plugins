/** Public, lightweight entry point shared by platform and manually configured consumers. */
export { createDorisConnection, DorisWorkbenchAdapter, requireDorisReadStatement } from './lib/doris-workbench.js'
export type { DorisAdapterOptions } from './lib/doris.strategy.js'
