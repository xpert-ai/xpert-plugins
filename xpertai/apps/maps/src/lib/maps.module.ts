import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MapsMiddleware } from './maps.middleware.js'
import { MapsViewProvider } from './maps-view.provider.js'

@XpertServerPlugin({ imports: [], providers: [MapsMiddleware, MapsViewProvider], exports: [MapsMiddleware, MapsViewProvider] })
export class MapsPluginModule {}
