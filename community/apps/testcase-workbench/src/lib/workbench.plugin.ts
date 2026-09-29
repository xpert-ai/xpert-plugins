import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WorkbenchRecord } from './workbench.entity.js'
import { TestCaseWorkbenchService } from './workbench.service.js'
import { TestCaseWorkbenchMiddleware } from './workbench.middleware.js'
import { TestCaseWorkbenchViewProvider } from './workbench-view.provider.js'

export const ENTITIES = [WorkbenchRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [TestCaseWorkbenchService, TestCaseWorkbenchMiddleware, TestCaseWorkbenchViewProvider],
  exports: [TestCaseWorkbenchService]
})
export class TestCaseWorkbenchPlugin {}
