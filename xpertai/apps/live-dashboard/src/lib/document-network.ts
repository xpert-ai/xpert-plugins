import type { ArtifactDocumentNetworkPolicy } from '@xpert-ai/plugin-sdk/artifact-document'

/** Trusted plugin policy, shared by the displayed document and browser preflight. */
export const DASHBOARD_NETWORK_POLICY: ArtifactDocumentNetworkPolicy = {
  scripts: ['https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
  styles: ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://unpkg.com', 'https://fonts.googleapis.com'],
  fonts: ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://unpkg.com', 'https://fonts.gstatic.com']
}
