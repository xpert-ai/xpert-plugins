import type { OpenAIClient } from '@langchain/openai'
import { completeResponseArguments } from './responses.js'

type Event = OpenAIClient.Responses.ResponseStreamEvent
const add = (index: number): Event => ({ type: 'response.output_item.added', output_index: index, sequence_number: 1,
  item: { type: 'function_call', id: `fc_${index}`, call_id: `call_${index}`, name: 'lookup', arguments: '' } })
const done = (index: number, args: string): Event => ({ type: 'response.function_call_arguments.done',
  item_id: `fc_${index}`, output_index: index, sequence_number: 2, arguments: args })
const delta = (index: number, args: string): Event => ({ type: 'response.function_call_arguments.delta',
  item_id: `fc_${index}`, output_index: index, sequence_number: 2, delta: args })
// Only the fields consumed by the normalizer are needed for this terminal fixture.
const complete = { type: 'response.completed', response: { status: 'completed' } } as Event
async function collect(events: Event[]) {
  async function* stream() { yield* events }
  const result: Event[] = []
  for await (const event of completeResponseArguments(stream())) result.push(event)
  return result.filter((e) => e.type === 'response.function_call_arguments.delta').map((e) => e.delta)
}

it('recovers two calls whose arguments are present only in done events', async () => {
  await expect(collect([add(0), add(1), done(0, '{"key":"alpha"}'), done(1, '{"key":"beta"}'), complete]))
    .resolves.toEqual(['{"key":"alpha"}', '{"key":"beta"}'])
})
it('does not duplicate normal deltas or repeated complete arguments', async () => {
  await expect(collect([add(0), delta(0, '{"key":'), delta(0, '"alpha"}'),
    done(0, '{"key":"alpha"}'), done(0, '{"key":"alpha"}'), complete]))
    .resolves.toEqual(['{"key":', '"alpha"}'])
})
it('recovers only a missing suffix', async () => {
  await expect(collect([add(0), delta(0, '{"key":'), done(0, '{"key":"alpha"}'), complete]))
    .resolves.toEqual(['{"key":', '"alpha"}'])
})
it('rejects contradictory or unknown tool arguments', async () => {
  await expect(collect([add(0), delta(0, '{"wrong":'), done(0, '{"key":"alpha"}'), complete])).rejects.toThrow('Inconsistent')
  await expect(collect([done(0, '{}'), complete])).rejects.toThrow('Inconsistent')
})
it.each(['response.failed', 'response.incomplete', 'error'])('rejects terminal %s', async (type) => {
  await expect(collect([{ type } as Event])).rejects.toThrow('did not complete')
})
it('rejects disconnect without terminal confirmation', async () => {
  await expect(collect([add(0), done(0, '{}')])).rejects.toThrow('without a completed')
})
