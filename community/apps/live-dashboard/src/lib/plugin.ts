import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DashboardService } from './dashboard.service'
import { DashboardViewProvider } from './view.provider'
import { DashboardMiddleware } from './middleware'
import { HtmlDashboardValidation } from './html-validation'
@XpertServerPlugin({ providers: [DashboardService, DashboardViewProvider, DashboardMiddleware, HtmlDashboardValidation] })
export class LiveDashboardPlugin {}
