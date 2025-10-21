import { IIntegration } from '@metad/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class DifyService {

	async test(integration: IIntegration) {
		const options = integration.options
		if (!options?.url) {
			throw new BadRequestException('Dify Url is required')
		}

		let baseUrl: string = options.url
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/v1')) {
			baseUrl = baseUrl.slice(0, -3)
		}

		try {
			const response = await fetch(`${baseUrl}/v1`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${options.apiKey || ''}`,
					'Content-Type': 'application/json'
				}
			})
			if (!response.ok) {
				throw new BadRequestException(`Failed to connect to Dify: ${response.statusText}`)
			}

			return await response.json()
		} catch (error: any) {
			throw new BadRequestException(`Error connecting to Dify: ${error.message}`)
		}
	}
}
