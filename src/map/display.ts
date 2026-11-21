import type { EoMap } from '@thewakingsands/eorzea-interactive-map'
import type { CircleMarker, Marker as LeafletMarker, Polyline } from 'leaflet'
import type { MapInfo } from '../components/map'
import type { Marker } from './interface'
import { coverZoom, frameView, type MapPoint, viewBounds } from './viewport'

type Library = typeof import('@thewakingsands/eorzea-interactive-map')
type MapMarker = CircleMarker | LeafletMarker
interface DisplayState {
  map: number | null
  markers: Map<
    string,
    {
      layer: MapMarker
      signature: string
      x: number
      y: number
      title: string | undefined
      compact: boolean
    }
  >
  line: Polyline | null
  linePoints?: MapInfo['line']
  focus: string | null
  /** Set once the map covers its frame; the width a panel takes on the right */
  insetRight?: number
  /** The limits last given to the map, and the frame the last focus was worked out for */
  limits?: string
  frame?: string
  /** The user has dragged or zoomed the map since the last focus */
  moved?: boolean
}
const playerHtml =
  '<svg class="map-player-cone" viewBox="-22 -22 44 44"><defs><radialGradient id="map-player-cone"><stop offset="0.25" stop-color="#86d8ff" stop-opacity="0.55"/><stop offset="1" stop-color="#86d8ff" stop-opacity="0"/></radialGradient></defs><path d="M0 0 L-12 -20 A23 23 0 0 1 12 -20 Z" fill="url(#map-player-cone)"/></svg><span class="map-player-dot"></span>'
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
  if (marker.kind === 'player')
    return library.L.marker(instance.mapToLatLng2D(marker.x, marker.y), {
      icon: library.L.divIcon({
        className: 'map-player',
        html: playerHtml,
        iconSize: [0, 0],
      }),
      interactive: false,
      keyboard: false,
      pane: 'popupPane',
      zIndexOffset: 2000,
    }).addTo(instance)
  if (marker.kind === 'observed' || marker.kind === 'history') {
    return library.L.circleMarker(instance.mapToLatLng2D(marker.x, marker.y), {
      radius: 7,
      color: '#f4e6b2',
      fillColor: '#e9cd73',
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
    state.linePoints = undefined
    await instance.loadMapKey(value.map)
    state.map = value.map
    state.focus = null
    title.textContent = instance.mapInfo.placeName ?? ''
  }
  if (value.viewport) {
    title.hidden = true
    if (state.insetRight === undefined) {
      instance.options.maxBoundsViscosity = 1
      instance.on('zoomend resize', () => cover(instance, state))
      const moved = () => {
        state.moved = true
      }
      instance.on('dragstart', moved)
      instance
        .getContainer()
        .addEventListener('wheel', moved, { passive: true })
    }
    state.insetRight = value.viewport.insetRight
    cover(instance, state)
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
      current = {
        layer,
        signature,
        x: marker.x,
        y: marker.y,
        title: undefined,
        compact: false,
      }
      state.markers.set(key, current)
    } else if (current.x !== marker.x || current.y !== marker.y) {
      current.layer.setLatLng(instance.mapToLatLng2D(marker.x, marker.y))
      current.x = marker.x
      current.y = marker.y
    }
    if (marker.kind === 'player') {
      const cone = (current.layer as LeafletMarker)
        .getElement()
        ?.querySelector<SVGElement>('.map-player-cone')
      if (cone) {
        const heading = marker.headingDegrees ?? null
        cone.style.display = heading === null ? 'none' : ''
        if (heading !== null) cone.style.transform = `rotate(${heading}deg)`
      }
    } else if (marker.ring !== undefined)
      (current.layer as LeafletMarker)
        .getElement()
        ?.classList.toggle('map-marker-ring', marker.ring)
    const compact = marker.compact ?? false
    if (
      compact !== current.compact &&
      current.layer instanceof library.L.Marker
    ) {
      current.compact = compact
      const { options } = current.layer.getIcon()
      const iconUrl = 'iconUrl' in options && options.iconUrl
      if (iconUrl) {
        const size = compact ? 18 : 32
        current.layer.setIcon(
          library.L.icon({
            ...options,
            iconUrl,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        )
      }
    }
    if (marker.title === current.title) continue
    current.title = marker.title
    if (marker.title) {
      if (current.layer.getTooltip())
        current.layer.setTooltipContent(tooltip(marker.title))
      else
        current.layer
          .bindTooltip(tooltip(marker.title), {
            permanent: true,
            direction: 'top',
            // Above the marker rather than across its upper half.
            offset: [0, marker.icon ? (marker.ring ? -21 : -16) : -8],
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
  if (value.line && !samePoints(value.line, state.linePoints)) {
    state.linePoints = value.line
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
  } else if (!value.line) {
    state.line?.remove()
    state.line = null
    state.linePoints = undefined
  }
  const main = markers[0]
  const focus =
    value.focus ??
    (main ? { key: `${main.x}:${main.y}`, points: [main] } : null)
  const size = instance.getSize?.()
  const frame = `${size?.x}:${size?.y}:${value.viewport?.insetRight}`
  // A frame that has changed size is focused again, unless the user has moved the map since.
  if (
    focus &&
    value.viewport &&
    (focus.key !== state.focus || (frame !== state.frame && !state.moved))
  ) {
    // A frame without a size yet is focused by the next update.
    if (!size?.x || !size.y) return
    state.focus = focus.key
    state.frame = frame
    state.moved = false
    const point = ({ x, y }: { x: number; y: number }) =>
      instance.mapToLatLng2D(x, y) as MapPoint
    const view = frameView(
      focus.points.map(point),
      {
        width: size.x,
        height: size.y,
        insetRight: value.viewport.insetRight,
      },
      focus.primary && point(focus.primary),
    )
    // setView keeps the centre inside the bounds it finds, so they have to be those of the new zoom already.
    instance.options.maxBounds = library.L.latLngBounds(
      viewBounds(value.viewport.insetRight, view.zoom),
    )
    instance.setView(view.center, view.zoom, { animate: false })
  } else if (focus && focus.key !== state.focus && focus.points.length) {
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

/** Keeps the map covering its frame: it cannot be zoomed out or moved until the frame shows beside it */
function cover(instance: EoMap, state: DisplayState) {
  const { x, y } = instance.getSize()
  if (!x || !y) return
  const minimum = coverZoom(x, y)
  if (instance.options.minZoom !== minimum) instance.setMinZoom(minimum)
  const bounds = viewBounds(state.insetRight ?? 0, instance.getZoom())
  instance.panInsideBounds(bounds, { animate: false })
  // Every update comes through here, so that a map that missed its limits once gets them with the next one.
  const limits = JSON.stringify(bounds)
  if (limits === state.limits) return
  state.limits = limits
  instance.setMaxBounds(bounds)
}

function samePoints(
  points: NonNullable<MapInfo['line']>,
  previous: MapInfo['line'],
) {
  return (
    points.length === previous?.length &&
    points.every(
      ({ x, y }, index) => x === previous[index].x && y === previous[index].y,
    )
  )
}
