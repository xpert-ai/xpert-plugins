import { validateTravelItinerary } from './types'

describe('validateTravelItinerary', () => {
  const requirements = {
    destination: '京都',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    travelers: 2,
    budget: 1000,
    interests: ['history']
  }

  it('accepts an itinerary within the budget', () => {
    expect(validateTravelItinerary({
      days: [{ date: '2026-10-01', activities: [{ startTime: '09:00', endTime: '11:00', title: '清水寺', location: '京都', estimatedCost: 500 }] }],
      totalEstimatedCost: 500,
      warnings: []
    }, requirements)).toEqual({ valid: true, errors: [] })
  })

  it('rejects overlapping activities and budget overruns', () => {
    const result = validateTravelItinerary({
      days: [{ date: '2026-10-01', activities: [
        { startTime: '09:00', endTime: '12:00', title: 'A', location: '京都' },
        { startTime: '11:00', endTime: '13:00', title: 'B', location: '京都' }
      ] }],
      totalEstimatedCost: 1200,
      warnings: []
    }, requirements)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining(['预计费用 1200 超出预算 1000', '行程 2026-10-01 存在时间冲突']))
  })
})
