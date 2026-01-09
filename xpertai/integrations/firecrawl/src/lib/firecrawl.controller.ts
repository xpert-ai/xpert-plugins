import { type IIntegration, LanguagesEnum } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { I18nLang } from 'nestjs-i18n'
import { FirecrawlService } from './firecrawl.service.js'

@Controller('firecrawl')
export class FirecrawlController {
	constructor(
		private readonly service: FirecrawlService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration, @I18nLang() languageCode: LanguagesEnum) {
		await this.service.test(integration, languageCode)
	}
}
