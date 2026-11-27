import { invokeClientCommand } from './bridge'

export interface ScoringRequest {
  screeningId: string
  text: string
}

export function sendScoringRequest(request: ScoringRequest) {
  return invokeClientCommand('assistant.chat.send_message', { text: request.text })
}
