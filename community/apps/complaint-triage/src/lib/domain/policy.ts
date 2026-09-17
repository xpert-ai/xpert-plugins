// The company's triage standard. It is handed to the model with every ticket so that grading follows
// the business rule set instead of the model's own notion of "serious", and it drives the review form.

export const CATEGORIES = [
  'safety',
  'product_quality',
  'logistics',
  'refund_return',
  'service_attitude',
  'billing',
  'other'
] as const
export type Category = (typeof CATEGORIES)[number]

export const SEVERITIES = ['P1', 'P2', 'P3', 'P4'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SENTIMENTS = ['angry', 'dissatisfied', 'neutral'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const CHANNELS = ['ecommerce', 'email', 'phone', 'other'] as const
export type Channel = (typeof CHANNELS)[number]

// Input limits live here (no zod import) so the Workbench bundle can share them with the server schema.
export const CONTENT_MIN_LENGTH = 10
export const CONTENT_MAX_LENGTH = 4000

export const CATEGORY_GUIDE: Record<Category, string> = {
  safety: 'Personal injury, fire, smoke, electric leakage, overheating or any other safety hazard.',
  product_quality: 'The product is defective, broken or does not work as described, without a safety hazard.',
  logistics: 'Late, lost, wrong or damaged delivery.',
  refund_return: 'Disputes about refunds, returns or exchanges.',
  service_attitude: 'Complaints about how staff treated the customer.',
  billing: 'Wrong charge, invoice or coupon problems.',
  other: 'Anything that does not fit the categories above.'
}

export const SEVERITY_GUIDE: Record<Severity, { rule: string; responseWithinHours: number }> = {
  P1: {
    rule: 'Safety hazard or injury; or the customer explicitly threatens regulators, media exposure or a lawsuit.',
    responseWithinHours: 2
  },
  P2: {
    rule: 'Product completely unusable; a repeated complaint about the same issue; or a refund dispute of 1000 CNY or more.',
    responseWithinHours: 8
  },
  P3: {
    rule: 'Partial malfunction, delivery delay or damage, or a service attitude problem.',
    responseWithinHours: 24
  },
  P4: {
    rule: 'Questions, suggestions or mild dissatisfaction.',
    responseWithinHours: 48
  }
}
