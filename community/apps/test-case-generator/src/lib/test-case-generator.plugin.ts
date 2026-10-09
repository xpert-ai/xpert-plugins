import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TestCaseGeneratorMiddleware } from './test-case-generator.middleware'
import { TestCaseGeneratorService } from './test-case-generator.service'
import { TestCaseGeneratorViewProvider } from './test-case-generator-view.provider'
import { TestCaseEntity, TestCaseProjectEntity } from './entities'

const TEST_CASE_GENERATOR_ENTITIES = [TestCaseProjectEntity, TestCaseEntity]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(TEST_CASE_GENERATOR_ENTITIES)],
  entities: TEST_CASE_GENERATOR_ENTITIES,
  providers: [TestCaseGeneratorService, TestCaseGeneratorMiddleware, TestCaseGeneratorViewProvider],
  exports: [TestCaseGeneratorService]
})
export class TestCaseGeneratorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${TestCaseGeneratorPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${TestCaseGeneratorPlugin.name} is being destroyed...`)
  }
}
