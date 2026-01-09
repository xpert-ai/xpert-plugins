import { IIntegration } from '@metad/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class FastGPTService {

	async test(integration: IIntegration) {
		const options = integration.options

		let baseUrl = options.url || `https://api.fastgpt.in/`
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/api')) {
			baseUrl = baseUrl.slice(0, -4)
		}

		try {
			const response = await fetch(`${baseUrl}/api/v1/chat/completions`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${options.apiKey || ''}`,
					'Content-Type': 'application/json'
				}
			})
			return await response.json()
		} catch (error: any) {
			throw new BadRequestException(`Error connecting to FastGPT: ${error.message}`)
		}
	}
}
