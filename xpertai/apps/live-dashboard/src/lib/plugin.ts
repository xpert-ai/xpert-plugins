import { DashboardProjectsService } from './projects.service'
import { DashboardCapability } from './content-capability'
import { DashboardMonitor, DashboardMonitorMiddleware } from './monitor'
import { DashboardContentProvider, DashboardContentEditor } from './content.provider'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DashboardService } from './dashboard.service'
import { DashboardViewProvider } from './view.provider'
import { DashboardMiddleware } from './middleware'
import { HtmlDashboardValidation } from './html-validation'
import { DashboardPresentationProvider } from './presentation.provider'
import { DashboardSharingService } from './sharing.service'
import { DashboardArtifactType } from './artifact-type.provider'
@XpertServerPlugin({ providers: [DashboardProjectsService, DashboardMonitor, DashboardMonitorMiddleware, DashboardArtifactType, DashboardCapability, DashboardContentProvider, DashboardContentEditor, DashboardService, DashboardViewProvider, DashboardMiddleware, HtmlDashboardValidation, DashboardPresentationProvider, DashboardSharingService] })
export class LiveDashboardPlugin {}
