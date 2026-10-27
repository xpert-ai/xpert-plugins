import { PresentationCapability } from './content-capability.js'
import { PresentationContentProvider, PresentationContentEditor } from './presentation-content.provider.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  PresentationActionLog,
  PresentationAsset,
  PresentationDeck,
  PresentationDeckVersion,
  PresentationExport
} from './entities/index.js'
import { PresentationCatalogService } from './presentation-catalog.service.js'
import { PresentationCollaborationProvider } from './presentation-collaboration.provider.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { PresentationDebugService } from './presentation-debug.service.js'
import { PresentationExportProcessor } from './presentation-export.processor.js'
import { PresentationRendererService } from './presentation-renderer.service.js'
import { PresentationStudioMiddleware } from './presentation-studio.middleware.js'
import { PresentationStudioService } from './presentation-studio.service.js'
import { PresentationStudioViewProvider } from './presentation-studio-view.provider.js'

export const PRESENTATION_STUDIO_ENTITIES = [
  PresentationDeck,
  PresentationDeckVersion,
  PresentationAsset,
  PresentationExport,
  PresentationActionLog
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(PRESENTATION_STUDIO_ENTITIES)],
  entities: PRESENTATION_STUDIO_ENTITIES,
  providers: [PresentationCapability,
    PresentationContentProvider, PresentationContentEditor,
    PresentationConfigService,
    PresentationDebugService,
    PresentationCatalogService,
    PresentationRendererService,
    PresentationStudioService,
    PresentationStudioMiddleware,
    PresentationStudioViewProvider,
    PresentationCollaborationProvider,
    PresentationExportProcessor
  ],
  exports: [PresentationStudioService]
})
export class PresentationStudioPlugin {}
