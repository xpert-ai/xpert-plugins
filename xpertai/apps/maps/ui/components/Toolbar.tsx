import { useState } from 'react'
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger } from '@xpert-ai/plugin-shadcn-ui'
import { Coffee, Footprints, MapPin, Navigation, Search, Sun } from 'lucide-react'
import type { MapsModel } from '../state'
import { useMapsI18n, type MessageKey } from '../i18n'
import { ActionButton } from './controls'
type Category = 'coffee' | 'walk' | 'sunset'
const categories: { key: Category; label: MessageKey; query: MessageKey; icon: typeof Coffee }[] = [
  { key: 'coffee', label: 'category.coffee', query: 'category.coffeeQuery', icon: Coffee },
  { key: 'walk', label: 'category.walk', query: 'category.walkQuery', icon: Footprints },
  { key: 'sunset', label: 'category.sunset', query: 'category.sunsetQuery', icon: Sun }
]
export function Toolbar({ model }: { model: MapsModel }) {
  const { t } = useMapsI18n(), [category, setCategory] = useState<Category>(), [cityOpen, setCityOpen] = useState(false)
  const submit = () => { setCategory(undefined); void model.search() }
  return <header className="shrink-0">
    <div className="plugin-toolbar">
      <div role="search" className="maps-search flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 focus-within:ring-1 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="query" className="sr-only">{t('search.label')}</label>
        <Input id="query" value={model.query} onChange={event => model.setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} className="maps-control min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder={t('search.placeholder')} maxLength={200} />
        <Button id="search-button" variant="outline" className="maps-button shrink-0" disabled={!model.connected} onClick={submit}>{t('search.submit')}</Button>
      </div>
      <Button aria-label={t('route.title')} className="maps-button toolbar-route" variant={model.tray === 'route' ? 'secondary' : 'outline'} onClick={model.openRoute} disabled={!model.selected}><Navigation className="size-4" aria-hidden="true" /><span>{t('route.title')}</span></Button>
    </div>
    <div className="plugin-filter">
      <Popover open={cityOpen} onOpenChange={setCityOpen}><PopoverTrigger asChild><ActionButton variant="ghost" className="maps-button location-label px-0" aria-label={t('search.city')}><MapPin className="size-3.5" aria-hidden="true" />{model.city || t('search.cityPlaceholder')}</ActionButton></PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-3"><label htmlFor="city" className="text-sm font-medium">{t('search.city')}</label><Input id="city" className="maps-control" value={model.city} onChange={event => model.setCity(event.target.value)} placeholder={t('search.cityPlaceholder')} maxLength={80} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setCityOpen(false) } }} /><Button variant="outline" className="maps-button w-full" onClick={() => setCityOpen(false)}>{t('action.close')}</Button></PopoverContent>
      </Popover>
      <div className="category-filters" role="group" aria-label={t('a11y.category')}>{categories.map(item => <Button key={item.key} variant="outline" size="sm" className="maps-button category-button" aria-pressed={category === item.key} onClick={() => { setCategory(item.key); void model.search({ query: t(item.query) }) }}><item.icon className="size-3.5" aria-hidden="true" /><span>{t(item.label)}</span></Button>)}</div>
      {model.service?.mode === 'demo' && <Badge variant="secondary" className="sample-badge">{t('mode.demo')}</Badge>}
    </div>
  </header>
}
