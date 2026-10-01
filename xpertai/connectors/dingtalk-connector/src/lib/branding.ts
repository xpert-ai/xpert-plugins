const DINGTALK_CONNECTOR_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="DingTalk"><path d="M512 64C265.6 64 64 265.6 64 512s201.6 448 448 448 448-201.6 448-448S758.4 64 512 64z m208 419.2c0 3.2-3.2 9.6-6.4 16-19.2 41.6-67.2 118.4-67.2 118.4l-12.8 25.6H704l-131.2 176 28.8-118.4H544l19.2-80c-16 3.2-32 9.6-54.4 16 0 0-28.8 16-83.2-32 0 0-35.2-32-16-41.6 9.6-3.2 44.8-6.4 70.4-12.8 38.4-6.4 60.8-6.4 60.8-6.4s-115.2 3.2-140.8-3.2-60.8-51.2-70.4-89.6c0 0-12.8-22.4 25.6-12.8s182.4 41.6 182.4 41.6-192-57.6-204.8-73.6S294.4 326.4 297.6 288c0 0 0-9.6 12.8-6.4 0 0 140.8 64 240 99.2 96 38.4 179.2 57.6 169.6 102.4z" fill="#040000"/></svg>'

export const DINGTALK_CONNECTOR_ICON = {
  type: 'image' as const,
  value: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DINGTALK_CONNECTOR_ICON_SVG)}`,
  size: 24
}
