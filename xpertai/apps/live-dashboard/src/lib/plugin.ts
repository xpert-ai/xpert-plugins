import { DashboardCapability } from './content-capability'
import { DashboardContentProvider, DashboardContentEditor } from './content.provider'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DashboardService } from './dashboard.service'
import { DashboardViewProvider } from './view.provider'
import { DashboardMiddleware } from './middleware'
import { HtmlDashboardValidation } from './html-validation'
import { DashboardPresentationProvider } from './presentation.provider'
import { DashboardSharingService } from './sharing.service'
@XpertServerPlugin({ providers: [DashboardCapability, DashboardContentProvider, DashboardContentEditor, DashboardService, DashboardViewProvider, DashboardMiddleware, HtmlDashboardValidation, DashboardPresentationProvider, DashboardSharingService] })
export class LiveDashboardPlugin {}
