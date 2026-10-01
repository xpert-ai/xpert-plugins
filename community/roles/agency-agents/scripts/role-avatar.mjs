const categoryEmoji = {
  academic: '1F393', company: '1F3E2', design: '1F3A8', engineering: '1F6E0-FE0F',
  finance: '1F4B0', 'game-development': '1F3AE', gis: '1F5FA-FE0F', healthcare: '1FA7A',
  hr: '1F465', legal: '2696-FE0F', marketing: '1F4E3', 'paid-media': '1F4FA',
  product: '1F4E6', 'project-management': '1F4CB', research: '1F52C', sales: '1F91D',
  security: '1F6E1-FE0F', 'spatial-computing': '1F30C', specialized: '1F9E9',
  'supply-chain': '1F69A', support: '1F3A7', testing: '1F9EA'
}
const namedColors = {
  blue: '#0000FF', purple: '#800080', orange: '#FFA500', green: '#008000', pink: '#FFC0CB',
  teal: '#008080', indigo: '#4B0082', cyan: '#00FFFF', violet: '#EE82EE', yellow: '#FFFF00',
  red: '#FF0000', fuchsia: '#FF00FF', lime: '#00FF00', gray: '#808080', gold: '#FFD700',
  navy: '#000080', crimson: '#DC143C', amber: '#F59E0B', slate: '#64748B', rose: '#F43F5E',
  steel: '#4682B4', 'metallic-blue': '#4682B4', 'neon-cyan': '#00FFFF', 'neon-green': '#39FF14'
}

export function roleAvatar(metadata, category) {
  const native = typeof metadata.emoji === 'string' ? metadata.emoji.trim() : ''
  const unified = native
    ? [...native].map((character) => character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join('-')
    : categoryEmoji[category] ?? '1F916'
  const color = typeof metadata.color === 'string' ? metadata.color.trim() : ''
  const background = /^#[\da-f]{6}$/i.test(color) ? color : namedColors[color.toLowerCase()] ?? '#64748B'
  const avatar = { emoji: { id: unified, unified, set: '' }, background }
  // The host emoji-mart catalog omits THREE NETWORKED COMPUTERS. Preserve that source symbol as SVG.
  if (unified === '1F5A7') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/><text x="32" y="34" text-anchor="middle" dominant-baseline="middle" font-size="36">&#x1F5A7;</text></svg>`
    avatar.url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }
  return avatar
}
