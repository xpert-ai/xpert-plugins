import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type IOnPluginBootstrap, type IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import {
  CutActionLog,
  CutAnalysisJob,
  CutCaptionDraft,
  CutEditProposal,
  CutExport,
  CutMediaAsset,
  CutMediaSegment,
  CutProject,
  CutProjectVersion,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import { CutMiddleware } from './cut.middleware.js'
import { CutCaptionService } from './cut-caption.service.js'
import { CutTranscriptionProcessor } from './cut-transcription.processor.js'
import { CutTranscriptionMediaService } from './cut-transcription-media.service.js'
import { CutSandboxWhisperService } from './cut-sandbox-whisper.service.js'
import { CutService } from './cut.service.js'
import { CutViewProvider } from './cut-view.provider.js'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { CutProposalService } from './cut-proposal.service.js'
import { CutRenderProcessor } from './cut-render.processor.js'
import { CutRenderService } from './cut-render.service.js'

export const CUT_ENTITIES = [
  CutProject,
  CutProjectVersion,
  CutMediaAsset,
  CutMediaSegment,
  CutExport,
  CutActionLog,
  CutAnalysisJob,
  CutTranscript,
  CutTranscriptSegment,
  CutCaptionDraft,
  CutEditProposal
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CUT_ENTITIES)],
  entities: CUT_ENTITIES,
  providers: [CutService, CutCaptionService, CutMediaIntelligenceService, CutProposalService, CutRenderService, CutTranscriptionMediaService, CutSandboxWhisperService, CutTranscriptionProcessor, CutRenderProcessor, CutMiddleware, CutViewProvider],
  exports: [CutService, CutCaptionService, CutMediaIntelligenceService, CutProposalService, CutRenderService, CutTranscriptionMediaService, CutSandboxWhisperService]
})
export class CutPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${CutPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${CutPlugin.name} is being destroyed...`)
  }
}
