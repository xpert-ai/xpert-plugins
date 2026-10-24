import type { IconDefinition } from '@xpert-ai/contracts'

const palette = { tile: '#EAF0FA', chart: '#3659A2', live: '#178577' }

/** Rising data columns with a detached live signal, legible without host fonts or CSS. */
export const dashboardIcon = {
  type: 'svg',
  alt: 'Live dashboards',
  value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
    <rect x="24" y="24" width="208" height="208" rx="40" fill="${palette.tile}"/>
    <rect x="66" y="144" width="26" height="44" rx="7" fill="${palette.chart}"/>
    <rect x="114" y="112" width="26" height="76" rx="7" fill="${palette.chart}"/>
    <rect x="162" y="96" width="26" height="92" rx="7" fill="${palette.live}"/>
    <circle cx="175" cy="72" r="13" fill="${palette.live}"/>
  </svg>`
} satisfies IconDefinition
