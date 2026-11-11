<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@xpert-ai/plugin-shadcn-vue'
import Feature from 'ol/Feature.js'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import Point from 'ol/geom/Point.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import { fromLonLat, toLonLat } from 'ol/proj.js'
import XYZ from 'ol/source/XYZ.js'
import VectorSource from 'ol/source/Vector.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import 'ol/ol.css'
import en from '../../../remote/locales/en-US.json'
import zh from '../../../remote/locales/zh-Hans.json'
import { connectToHost, type HostInit } from './bridge'
import { draftResultSchema, draftSchema, saveDraftReceiptSchema, type RoadEventDraft } from '../domain/draft'

type Messages = typeof en
const context = ref<HostInit | null>(null)
const connected = ref(false)
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const noticeKind = ref<'error' | 'success' | 'info'>('info')
const revision = ref(0)
const updatedAt = ref<string | null>(null)
const latitude = ref('')
const longitude = ref('')
const recommendation = ref<RoadEventDraft['recommendation']>(null)
const recommendationAttempt = ref<RoadEventDraft['recommendationAttempt']>(null)
const mapTarget = ref<HTMLDivElement | null>(null)
const mapUnavailable = ref(false)
let disposeBridge: (() => void) | undefined
let bridge: ReturnType<typeof connectToHost> | undefined
let map: Map | undefined
let mapSelection: Feature<Point> | undefined
let mapSource: VectorSource | undefined
const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN?.trim()
const DEFAULT_MAP_CENTER: [number, number] = [118.96, 32.15]

const messages = computed<Messages>(() => context.value?.locale.startsWith('zh') ? zh : en)
const form = reactive({
  title: '',
  eventType: 'accident' as RoadEventDraft['eventType'],
  severity: 'medium' as RoadEventDraft['severity'],
  locationDescription: '',
  description: '',
  occurredAt: ''
})

function setForm(draft: RoadEventDraft | null) {
  form.title = draft?.title ?? ''
  form.eventType = draft?.eventType ?? 'accident'
  form.severity = draft?.severity ?? 'medium'
  form.locationDescription = draft?.locationDescription ?? ''
  form.description = draft?.description ?? ''
  latitude.value = draft?.coordinates ? String(draft.coordinates.latitude) : ''
  longitude.value = draft?.coordinates ? String(draft.coordinates.longitude) : ''
  recommendation.value = draft?.recommendation ?? null
  recommendationAttempt.value = draft?.recommendationAttempt ?? null
  if (draft?.occurredAt) {
    const date = new Date(draft.occurredAt)
    form.occurredAt = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  } else {
    const date = new Date()
    form.occurredAt = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  syncMapSelection(true)
}

function syncMapSelection(center = false) {
  if (!map || !mapSelection || !mapSource) return
  if (!latitude.value.trim() && !longitude.value.trim()) {
    mapSelection.setGeometry(undefined)
    return
  }
  const lat = Number(latitude.value)
  const lon = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    mapSelection.setGeometry(undefined)
    return
  }
  const point = fromLonLat([lon, lat])
  mapSelection.setGeometry(new Point(point))
  if (center) map.getView().animate({ center: point, zoom: Math.max(map.getView().getZoom() ?? 4, 12), duration: 250 })
}

function setCoordinates(lon: number, lat: number, center = false) {
  longitude.value = lon.toFixed(6)
  latitude.value = lat.toFixed(6)
  syncMapSelection(center)
}

function initializeMap() {
  if (!mapTarget.value) return
  mapUnavailable.value = !tiandituToken
  const tileUrl = (layer: 'vec' | 'cva') =>
    `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(tiandituToken ?? '')}`
  const tiles = new XYZ({
    url: tileUrl('vec'),
    attributions: '国家地理信息公共服务平台 天地图',
    maxZoom: 18
  })
  const labels = new XYZ({ url: tileUrl('cva'), maxZoom: 18 })
  tiles.on('tileloaderror', () => { mapUnavailable.value = true })
  labels.on('tileloaderror', () => { mapUnavailable.value = true })
  mapSource = new VectorSource()
  mapSelection = new Feature<Point>()
  mapSelection.setStyle(new Style({
    image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#c43d3d' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
  }))
  mapSource.addFeature(mapSelection)
  map = new Map({
    target: mapTarget.value,
    layers: [new TileLayer({ source: tiles }), new TileLayer({ source: labels }), new VectorLayer({ source: mapSource })],
    view: new View({ center: fromLonLat(DEFAULT_MAP_CENTER), zoom: 12 })
  })
  map.on('click', (event) => {
    const geographic = toLonLat(event.coordinate)
    setCoordinates(geographic[0], geographic[1])
  })
}

function showError(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  noticeKind.value = 'error'
  notice.value = code === 'conflict' ? messages.value.conflict
    : code === 'invalid_input' || error instanceof Error && error.name === 'ZodError' ? messages.value.validationError
      : messages.value.saveError
}

async function loadDraft() {
  if (!bridge) return
  loading.value = true
  notice.value = ''
  try {
    const loaded = await bridge.query(draftResultSchema)
    revision.value = loaded.revision
    updatedAt.value = loaded.updatedAt
    setForm(loaded.draft)
    noticeKind.value = loaded.draft ? 'success' : 'info'
    notice.value = loaded.draft ? messages.value.restored : messages.value.newDraft
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
    bridge.resize()
  }
}

async function saveDraft() {
  if (!bridge || saving.value || loading.value) return
  notice.value = ''
  const occurredAtDate = form.occurredAt ? new Date(form.occurredAt) : null
  const parsed = draftSchema.safeParse({
    ...form,
    title: form.title.trim(),
    locationDescription: form.locationDescription.trim(),
    description: form.description.trim(),
    occurredAt: occurredAtDate && !Number.isNaN(occurredAtDate.getTime()) ? occurredAtDate.toISOString() : '',
    coordinates: !latitude.value.trim() && !longitude.value.trim() ? null : {
      longitude: longitude.value.trim() ? Number(longitude.value) : Number.NaN,
      latitude: latitude.value.trim() ? Number(latitude.value) : Number.NaN
    },
    recommendation: recommendation.value
  })
  if (!parsed.success) {
    noticeKind.value = 'error'
    const fields = [...new Set(parsed.error.issues.map((issue) => {
      const field = issue.path[0]
      if (field === 'coordinates') return messages.value.coordinatesValidation
      if (field === 'title') return messages.value.titleValidation
      if (field === 'locationDescription') return messages.value.locationValidation
      if (field === 'description') return messages.value.descriptionValidation
      if (field === 'occurredAt') return messages.value.occurredAtValidation
      return messages.value.validationError
    }))]
    notice.value = `${messages.value.validationError}: ${fields.join('；')}`
    return
  }

  saving.value = true
  try {
    const receipt = await bridge.action('save_draft', {
      expectedRevision: revision.value,
      draft: parsed.data
    }, saveDraftReceiptSchema)
    revision.value = receipt.revision
    updatedAt.value = receipt.updatedAt
    noticeKind.value = 'success'
    notice.value = messages.value.saved
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  bridge = connectToHost()
  disposeBridge = bridge.dispose
  try {
    initializeMap()
    context.value = await bridge.connected
    connected.value = true
    document.documentElement.lang = context.value.locale
    await loadDraft()
    bridge.resize()
  } catch {
    loading.value = false
    showError(new Error('host_unavailable'))
  }
})

onBeforeUnmount(() => {
  disposeBridge?.()
  map?.setTarget(undefined)
})
</script>

<template>
  <main class="command-center-shell">
    <div class="command-center-toolbar">
      <div>
        <h1>{{ messages.title }}</h1>
        <p class="command-center-subtitle">{{ messages.subtitle }}</p>
      </div>
      <Badge :variant="connected ? 'default' : 'secondary'">
        {{ connected ? messages.connected : messages.connecting }}
      </Badge>
    </div>

    <Card class="command-center-card">
      <CardHeader>
        <div class="command-center-section-heading">
          <div>
            <CardTitle>{{ messages.formTitle }}</CardTitle>
            <CardDescription>{{ messages.formDescription }}</CardDescription>
          </div>
          <span class="command-center-revision">{{ messages.revision }} {{ revision }}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div class="draft-form" role="form" @keydown.enter.prevent="saveDraft">
          <label class="field field-wide">
            <span>{{ messages.titleLabel }}</span>
            <input v-model="form.title" :placeholder="messages.titlePlaceholder" maxlength="80" required minlength="5" :disabled="loading">
          </label>

          <label class="field">
            <span>{{ messages.eventTypeLabel }}</span>
            <select v-model="form.eventType" :disabled="loading">
              <option value="accident">{{ messages.types.accident }}</option>
              <option value="road_blockage">{{ messages.types.road_blockage }}</option>
              <option value="hazard">{{ messages.types.hazard }}</option>
              <option value="weather">{{ messages.types.weather }}</option>
              <option value="other">{{ messages.types.other }}</option>
            </select>
          </label>

          <label class="field">
            <span>{{ messages.severityLabel }}</span>
            <select v-model="form.severity" :disabled="loading">
              <option value="low">{{ messages.severities.low }}</option>
              <option value="medium">{{ messages.severities.medium }}</option>
              <option value="high">{{ messages.severities.high }}</option>
              <option value="critical">{{ messages.severities.critical }}</option>
            </select>
          </label>

          <label class="field field-wide">
            <span>{{ messages.locationLabel }}</span>
            <input v-model="form.locationDescription" :placeholder="messages.locationPlaceholder" maxlength="160" required minlength="2" :disabled="loading">
          </label>

          <section class="field-wide location-picker" aria-labelledby="map-picker-title">
            <div class="picker-heading">
              <div>
                <h2 id="map-picker-title">{{ messages.mapTitle }}</h2>
                <p>{{ messages.mapDescription }}</p>
              </div>
              <p v-if="mapUnavailable" class="map-warning" role="status">
                {{ tiandituToken ? messages.mapUnavailable : messages.mapTokenMissing }}
              </p>
            </div>
            <div ref="mapTarget" class="location-map" :aria-label="messages.mapTitle" />
            <div class="coordinate-fields">
              <label class="field">
                <span>{{ messages.latitudeLabel }}</span>
                <input v-model="latitude" type="text" inputmode="decimal" autocomplete="off" :placeholder="messages.latitudePlaceholder" :disabled="loading" @change="syncMapSelection()">
              </label>
              <label class="field">
                <span>{{ messages.longitudeLabel }}</span>
                <input v-model="longitude" type="text" inputmode="decimal" autocomplete="off" :placeholder="messages.longitudePlaceholder" :disabled="loading" @change="syncMapSelection()">
              </label>
            </div>
          </section>

          <label class="field field-wide">
            <span>{{ messages.descriptionLabel }}</span>
            <textarea v-model="form.description" :placeholder="messages.descriptionPlaceholder" rows="5" maxlength="2000" required minlength="10" :disabled="loading" @keydown.enter.stop />
          </label>

          <section v-if="recommendation" class="field-wide recommendation-panel" aria-labelledby="recommendation-title">
            <div class="recommendation-heading">
              <h2 id="recommendation-title">{{ messages.recommendationTitle }}</h2>
              <span>{{ messages.recommendationSeverity }}: {{ messages.severities[recommendation.severity] }}</span>
            </div>
            <p class="recommendation-summary">{{ recommendation.summary }}</p>
            <ol class="recommendation-actions">
              <li v-for="(action, index) in recommendation.actions" :key="`${index}-${action.title}`">
                <strong>{{ action.title }}</strong>
                <span>{{ action.details }}</span>
              </li>
            </ol>
            <ul v-if="recommendation.cautions.length" class="recommendation-cautions">
              <li v-for="caution in recommendation.cautions" :key="caution">{{ caution }}</li>
            </ul>
            <p class="recommendation-meta">
              {{ messages.generatedBy }} {{ recommendation.model }} · {{ new Date(recommendation.generatedAt).toLocaleString(context?.locale) }}
            </p>
          </section>

          <label class="field">
            <span>{{ messages.occurredAtLabel }}</span>
            <input v-model="form.occurredAt" type="datetime-local" required :disabled="loading">
          </label>

          <aside v-if="recommendationAttempt?.status === 'failed'" class="field-wide recommendation-failure" role="alert">
            <strong>{{ messages.recommendationFailed }}</strong>
            <span>{{ messages.recommendationRetry }}</span>
          </aside>

          <div class="form-footer field-wide">
            <p class="form-notice" :class="'notice-' + noticeKind" role="status" aria-live="polite">
              {{ loading ? messages.loading : notice }}
              <span v-if="updatedAt"> · {{ messages.lastSaved }} {{ new Date(updatedAt).toLocaleString(context?.locale) }}</span>
            </p>
            <div class="form-actions">
              <Button type="button" variant="outline" :disabled="loading || saving || !connected" @click="loadDraft">
                {{ messages.reload }}
              </Button>
              <Button type="button" :disabled="loading || saving || !connected" @click="saveDraft">
                {{ saving ? messages.saving : messages.save }}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </main>
</template>
