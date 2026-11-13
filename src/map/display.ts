import type { EoMap } from '@thewakingsands/eorzea-interactive-map'
import type { CircleMarker, Marker as LeafletMarker, Polyline } from 'leaflet'
import type { MapInfo } from '../components/map'
import type { Marker } from './interface'

type Library = typeof import('@thewakingsands/eorzea-interactive-map')
type MapMarker = CircleMarker | LeafletMarker
interface DisplayState {
  map: number | null
  markers: Map<string, { layer: MapMarker; signature: string }>
  line: Polyline | null
  focus: string | null
}
const states = new WeakMap<EoMap, DisplayState>()
const escaped = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  )
function tooltip(value: string) {
  return escaped(value).replace(
    /\[icon:(\d+)\]/g,
    (_, icon) => `<i class="icon">&#${icon};</i>`,
  )
}
function createMarker(
  instance: EoMap,
  marker: Marker,
  library: Pick<Library, 'loader' | 'simpleMarker' | 'L'>,
) {
  if (
    marker.kind === 'player' ||
    marker.kind === 'observed' ||
    marker.kind === 'history'
  ) {
    return library.L.circleMarker(instance.mapToLatLng2D(marker.x, marker.y), {
      radius: marker.kind === 'player' ? 5 : 7,
      color: marker.kind === 'player' ? '#86d8ff' : '#f4e6b2',
      fillColor: marker.kind === 'player' ? '#86d8ff' : '#e9cd73',
      fillOpacity: marker.kind === 'history' ? 0 : 1,
      weight: 2,
      className: `exploration-marker-${marker.kind}`,
    }).addTo(instance)
  }
  if (!marker.icon) return null
  const url = library.loader.getIconUrl(
    `ui/icon/${marker.icon.substring(0, 3)}000/${marker.icon}.tex`,
  )
  if (!url) return null
  const layer = library.simpleMarker(marker.x, marker.y, url, instance.mapInfo)
  instance.addMarker(layer)
  return layer
}
export async function displayMap(
  instance: EoMap,
  value: MapInfo,
  library: Pick<Library, 'loader' | 'simpleMarker' | 'L'>,
  title: HTMLElement,
) {
  let state = states.get(instance)
  if (!state) {
    state = { map: null, markers: new Map(), line: null, focus: null }
    states.set(instance, state)
  }
  const changed = state.map !== value.map
  if (changed) {
    for (const { layer } of state.markers.values()) layer.remove()
    state.markers.clear()
    state.line?.remove()
    state.line = null
    await instance.loadMapKey(value.map)
    state.map = value.map
    state.focus = null
    title.textContent = instance.mapInfo.placeName ?? ''
  }
  const markers = value.markers ?? []
  const keys = new Set<string>()
  for (const [index, marker] of markers.entries()) {
    const key = marker.id ?? String(index)
    keys.add(key)
    const signature = `${marker.kind ?? 'icon'}:${marker.icon ?? ''}`
    let current = state.markers.get(key)
    if (current && current.signature !== signature) {
      current.layer.remove()
      state.markers.delete(key)
      current = undefined
    }
    if (!current) {
      const layer = createMarker(instance, marker, library)
      if (!layer) continue
      current = { layer, signature }
      state.markers.set(key, current)
    } else current.layer.setLatLng(instance.mapToLatLng2D(marker.x, marker.y))
    if (marker.title) {
      if (current.layer.getTooltip())
        current.layer.setTooltipContent(tooltip(marker.title))
      else
        current.layer
          .bindTooltip(tooltip(marker.title), {
            permanent: true,
            direction: 'top',
            className: 'marker-tooltip',
          })
          .openTooltip()
    } else current.layer.unbindTooltip()
  }
  for (const [key, { layer }] of state.markers) {
    if (!keys.has(key)) {
      layer.remove()
      state.markers.delete(key)
    }
  }
  if (value.line) {
    const points = value.line.map(({ x, y }) => instance.mapToLatLng2D(x, y))
    if (state.line) state.line.setLatLngs(points)
    else
      state.line = library.L.polyline(points, {
        color: '#86d8ff',
        weight: 2,
        opacity: 0.8,
        dashArray: '5 5',
        interactive: false,
      }).addTo(instance)
  } else {
    state.line?.remove()
    state.line = null
  }
  const main = markers[0]
  const focus =
    value.focus ??
    (main ? { key: `${main.x}:${main.y}`, points: [main] } : null)
  if (focus && focus.key !== state.focus && focus.points.length) {
    state.focus = focus.key
    const points = focus.points.map(({ x, y }) => instance.mapToLatLng2D(x, y))
    if (points.length > 1)
      instance.fitBounds(points, {
        padding: [36, 60],
        maxZoom: -1,
        animate: false,
      })
    else instance.setView(points[0], -1, { animate: false })
  }
}
