import { BadRequestException, Injectable } from '@nestjs/common'
import { TDifyIntegrationOptions } from './types.js'

@Injectable()
export class DifyService {

	async test(options: TDifyIntegrationOptions) {
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
		let urlPath = '/v1'
		if (options.apiKey?.startsWith('app-')) {
			urlPath = '/v1/info'
		} else if (options.apiKey?.startsWith('dataset-')) {
			urlPath = '/v1/datasets'
		}
		try {
			const response = await fetch(`${baseUrl}${urlPath}?limit=1`, {
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
