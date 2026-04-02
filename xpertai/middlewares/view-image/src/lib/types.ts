export const ViewImagePluginName = 'view-image'

export {
  ViewImagePluginConfigFormSchema,
  ViewImagePluginConfigSchema,
  type ViewImagePluginConfig
} from './view-image.types.js'

export const ViewImageIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="view-image-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#005f73"/>
      <stop offset="100%" stop-color="#0a9396"/>
    </linearGradient>
  </defs>
  <rect x="6" y="10" width="52" height="38" rx="8" fill="url(#view-image-gradient)"/>
  <circle cx="22" cy="24" r="5" fill="#e9d8a6"/>
  <path d="M14 42l10-11 9 8 8-10 9 13H14z" fill="#94d2bd"/>
  <path d="M22 54c3.6-4.6 8.5-7 14.8-7 6.4 0 11.2 2.4 14.9 7" fill="none" stroke="#001219" stroke-width="5" stroke-linecap="round"/>
  <circle cx="32" cy="54" r="10" fill="#ee9b00"/>
  <circle cx="32" cy="54" r="4.5" fill="#001219"/>
</svg>`
