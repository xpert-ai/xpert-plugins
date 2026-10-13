export const en = {
  'search.label': 'Search places', 'search.placeholder': 'Find a place, café, or park…', 'search.submit': 'Search',
  'search.city': 'City or search area', 'search.cityPlaceholder': 'City', 'search.area': 'Search this area', 'search.cityRequired': 'Choose a city or search the current map area.', 'search.queryRequired': 'Enter a place or keyword.',
  'category.coffee': 'Coffee', 'category.walk': 'Walks', 'category.sunset': 'Sunset',
  'category.coffeeQuery': 'cafés', 'category.walkQuery': 'parks', 'category.sunsetQuery': 'scenic viewpoints',
  'map.label': 'Interactive map', 'map.help': 'Arrow keys pan the map. Plus and minus zoom. Press 0 to fit all places. The result list provides the same places.',
  'map.zoomIn': 'Zoom in', 'map.zoomOut': 'Zoom out', 'map.fit': 'Fit all places', 'map.loading': 'Updating map…', 'map.empty': 'Search for a place to begin',
  'map.failed': 'The map could not load', 'map.retry': 'Retry map', 'map.demo': 'Simulated map · Not for navigation',
  'result.title': 'Search results', 'result.count': { one: '{{count}} place', other: '{{count}} places' }, 'result.more': 'Load more',
  'result.empty': 'No places found in this area', 'result.emptyHint': 'Try another keyword or move the map to search a wider area.',
  'result.initial': 'Where would you like to explore?', 'result.initialHint': 'Search above or ask your Assistant to find places.',
  'result.loading': 'Finding nearby places…', 'result.failed': 'Places could not be retrieved', 'result.failureHint': 'Your search and map position have been kept.',
  'detail.title': 'Place details', 'detail.back': 'Back to results', 'detail.route': 'Get directions', 'detail.reference': 'Reference in chat', 'detail.referenced': 'Place added to the chat composer. Add your question before sending.', 'detail.referenceFailed': 'The place could not be added to chat.', 'detail.referenceUnavailable': 'Place references are available in the Workbench view.', 'detail.copy': 'Copy address', 'detail.copied': 'Address copied', 'detail.copyFailed': 'Address could not be copied', 'detail.failed': 'Details could not be updated',
  'route.title': 'Directions', 'route.back': 'Back to place', 'route.origin': 'Starting point', 'route.destination': 'Destination', 'route.choose': 'Choose a place', 'route.swap': 'Swap starting point and destination', 'route.driving': 'Driving', 'route.walking': 'Walking', 'route.plan': 'Plan route', 'route.loading': 'Updating route…', 'route.failed': 'No route is available', 'route.invalid': 'Choose two different places from the search results.', 'route.initial': 'Choose your starting point', 'route.initialHint': 'Select two places, then plan a route.', 'route.demo': 'Simulated distance, time, and route. Not for navigation.', 'route.clear': 'Clear route',
  'tray.collapse': 'Collapse results', 'tray.expand': 'Expand results', 'action.retry': 'Retry', 'action.close': 'Close',
  'provider.amap': 'AMap', 'provider.tencent': 'Tencent Maps', 'mode.demo': 'Demo data', 'mode.live': 'Map data',
  'status.connecting': 'Connecting…', 'status.failed': 'The map service is unavailable. Please retry.',
  'distance.meters': '{{value}} m', 'distance.km': '{{value}} km', 'duration.minutes': '{{value}} min', 'duration.hours': '{{hours}} hr {{minutes}} min',
  'a11y.place': '{{number}}. {{name}}', 'a11y.category': 'Suggested searches', 'a11y.results': 'Place results', 'a11y.routeMode': 'Travel mode', 'a11y.mapControls': 'Map controls'
} as const
export type MessageKey = keyof typeof en
export type Catalog = { [K in MessageKey]: typeof en[K] extends string ? string : { one: string; other: string } }
