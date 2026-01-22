import { type IIntegration, LanguagesEnum } from '@metad/contracts'
import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common'
import { I18nLang } from 'nestjs-i18n'
import { MinerUIntegrationStrategy } from './integration.strategy.js'

@Controller('mineru')
export class MinerUController {

	@Inject(MinerUIntegrationStrategy)
	private readonly minerUIntegrationStrategy: MinerUIntegrationStrategy


	@Post('test')
	async connect(@Body() integration: IIntegration, @I18nLang() languageCode: LanguagesEnum) {
		try {
			await this.minerUIntegrationStrategy.validateConfig(integration.options)
		} catch (error) {
			console.error(error)
			throw new BadRequestException(this.formatErrorMessage(languageCode, error))
		}

		return { success: true }
	}

	private formatErrorMessage(languageCode: LanguagesEnum, error: unknown): string {
		const baseMessage =
			{
				[LanguagesEnum.English]: 'Failed to connect to MinerU. Please verify your API configuration.',
				[LanguagesEnum.SimplifiedChinese]: '无法连接到 MinerU。请检查您的 API 配置。',
			}[languageCode] ?? 'Failed to connect to MinerU.'

		const detail = error instanceof Error ? error.message : String(error)

		return [baseMessage, detail].filter(Boolean).join(' ')
	}
}
