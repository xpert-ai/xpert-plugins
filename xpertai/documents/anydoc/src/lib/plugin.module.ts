import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { AnyDocSandboxConverter } from './convert.js'
import { AnyDocTransformerStrategy } from './transformer.strategy.js'
@XpertServerPlugin({ providers: [AnyDocSandboxConverter, AnyDocTransformerStrategy] })
export class AnyDocPluginModule {}
