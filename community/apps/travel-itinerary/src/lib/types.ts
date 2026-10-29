export type TravelPlanStatus = 'draft' | 'generating' | 'ready_for_review' | 'confirmed' | 'failed'

export interface TravelScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface TravelRequirements {
  destination: string
  startDate: string
  endDate: string
  travelers: number
  budget?: number | null
  interests: string[]
  specialRequests?: string | null
}

export interface TravelActivity {
  startTime: string
  endTime: string
  title: string
  location: string
  reason?: string
  estimatedCost?: number
}

export interface TravelDay {
  date: string
  activities: TravelActivity[]
}

export interface TravelItinerary {
  days: TravelDay[]
  totalEstimatedCost: number
  warnings: string[]
}

export interface TravelPlanRecord {
  id: string
  title: string
  status: TravelPlanStatus
  requirements: TravelRequirements
  itinerary?: TravelItinerary | null
  errorMessage?: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
}

export interface TravelPlanViewData {
  summary: { totalPlans: number; confirmedPlans: number; failedPlans: number }
  plans: TravelPlanRecord[]
  selectedPlan?: TravelPlanRecord | null
}

export function validateTravelItinerary(itinerary: TravelItinerary, requirements: TravelRequirements) {
  const errors: string[] = []
  if (!itinerary.days.length) errors.push('至少需要一个行程日')
  if (itinerary.totalEstimatedCost < 0) errors.push('预计费用不能为负数')
  if (requirements.budget != null && itinerary.totalEstimatedCost > requirements.budget) {
    errors.push(`预计费用 ${itinerary.totalEstimatedCost} 超出预算 ${requirements.budget}`)
  }

  const seenDates = new Set<string>()
  for (const day of itinerary.days) {
    if (seenDates.has(day.date)) errors.push(`行程日期重复：${day.date}`)
    seenDates.add(day.date)
    let previousEnd = ''
    for (const activity of day.activities) {
      if (!activity.title.trim() || !activity.location.trim()) errors.push(`行程 ${day.date} 存在缺少标题或地点的活动`)
      if (previousEnd && activity.startTime < previousEnd) errors.push(`行程 ${day.date} 存在时间冲突`)
      previousEnd = activity.endTime
    }
  }
  return { valid: errors.length === 0, errors }
}
