import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { OpenDataLoaderSandboxConverter } from './convert.js'
import { OpenDataLoaderTransformerStrategy } from './transformer.strategy.js'
@XpertServerPlugin({ providers: [OpenDataLoaderSandboxConverter, OpenDataLoaderTransformerStrategy] })
export class OpenDataLoaderPluginModule {}
