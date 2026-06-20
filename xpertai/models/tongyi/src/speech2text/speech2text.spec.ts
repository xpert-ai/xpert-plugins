import { Speech2TextChatModel } from './speech2text.js'

describe('Speech2TextChatModel', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('submits the configured speech2text model', async () => {
		const fetchMock = jest
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ output: { task_id: 'task-1' } })
			} as Response)
			.mockResolvedValueOnce({
				json: async () => ({
					output: {
						task_status: 'SUCCEEDED',
						results: [{ transcription_url: 'https://example.com/result.json' }]
					}
				})
			} as Response)
			.mockResolvedValueOnce({
				json: async () => ({ transcripts: [{ sentences: [{ text: 'hello' }] }] })
			} as Response)

		const chatModel = new Speech2TextChatModel({
			apiKey: 'test-key',
			model: 'paraformer-realtime-v1'
		})

		const result = await (chatModel as any)._generate(
			[{ content: [{ url: 'https://example.com/audio.wav' }] }],
			{}
		)

		const request = JSON.parse((fetchMock.mock.calls[0][1]?.body as string) ?? '{}')
		expect(request).toMatchObject({
			model: 'paraformer-realtime-v1',
			input: { file_urls: ['https://example.com/audio.wav'] }
		})
		expect(result.generations[0].text).toBe('hello')
	})
})
