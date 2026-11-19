import type { EoMap } from '@thewakingsands/eorzea-interactive-map'
import libraryCss from '@thewakingsands/eorzea-interactive-map/dist/map.css?inline'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { adapter, type MapSession } from '../../adapter'
import { displayMap } from '../../map/display'
import mapCss from '../../map/index.css?inline'
import iconCss from '../icon/index.css?inline'
import type { MapInfo } from './index'

export default function EmbeddedMap(value: MapInfo) {
  const { mapGeneration } = useSyncExternalStore(
    adapter.subscribeState,
    adapter.getState,
  )
  return <MapInstance key={mapGeneration} {...value} />
}

function MapInstance(value: MapInfo) {
  const [error, setError] = useState<string>()
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(value)
  latest.current = value
  const update = useRef<((value: MapInfo) => void) | undefined>(undefined)
  useEffect(() => {
    let disposed = false
    let session: MapSession | undefined
    let instance: EoMap | undefined
    let pending: MapInfo | undefined
    let updating = false
    let backgroundMap: number | undefined
    let backgroundWatch: AbortController | undefined
    const failed = (error: unknown) => {
      if (disposed) return
      console.error(error)
      const state = adapter.getState()
      setError(state.status === 'error' ? state.message : '地图资料不可用')
    }
    const element = host.current
    if (!element) return
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
    shadow.innerHTML =
      '<section class="erozea-map-outer"><div class="eorzea-map-glass"></div><div class="eorzea-map-inner" id="eorzea-map"></div><div class="eorzea-map-resize-handler"></div></section><span id="title" class="info"></span><span id="background-status" class="info" role="status" hidden>地图底图不可用</span>'
    const mapElement = shadow.getElementById('eorzea-map') as HTMLElement
    const blockMapLink = (event: MouseEvent) => {
      // The library delegates type-1 marker clicks to a map change outside MapInfo.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-data-type="1"]')
      )
        event.stopPropagation()
    }
    mapElement.addEventListener('click', blockMapLink, true)
    const backgroundStatus = shadow.getElementById(
      'background-status',
    ) as HTMLElement
    let sizeFrame = 0
    let width = -1
    let height = -1
    const syncSize = () => {
      const nextWidth = element.clientWidth
      const nextHeight = element.clientHeight
      if (width === nextWidth && height === nextHeight) return
      width = nextWidth
      height = nextHeight
      const outer = shadow.querySelector<HTMLElement>(
        '.erozea-map-outer',
      ) as HTMLElement
      outer.style.width = `${width}px`
      outer.style.height = `${height}px`
      instance?.invalidateSize({ animate: false, debounceMoveend: true })
    }
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(sizeFrame)
      sizeFrame = requestAnimationFrame(syncSize)
    })
    resize.observe(element)
    const initialize = async () => {
      const library = await import('@thewakingsands/eorzea-interactive-map')
      if (disposed) return
      // The library's initial animated zoom otherwise overrides the requested focus.
      library.L.Map.mergeOptions({ zoomAnimation: false })
      session = await adapter.createMapSession(library)
      if (disposed) {
        session.dispose()
        return
      }
      await library.getRegion()
      if (disposed) return
      const sheet = new CSSStyleSheet()
      const css = [
        libraryCss,
        mapCss,
        iconCss,
        ':host{all:initial;display:block;position:relative;isolation:isolate;width:100%;height:100%;overflow:hidden;background:transparent}.erozea-map-outer{border:0!important;border-radius:0!important;box-shadow:none!important}.eorzea-map-resize-handler{display:none}',
      ].join('\n')
      sheet.replaceSync(css)
      shadow.adoptedStyleSheets = [sheet]
      syncSize()
      const map = await library.create(mapElement)
      instance = map
      if (disposed) {
        instance.remove()
        return
      }
      map.invalidateSize({ animate: false })
      update.current = (current) => {
        pending = current
        if (updating) return
        updating = true
        const drain = async () => {
          while (pending && !disposed) {
            const next = pending
            pending = undefined
            await session?.prepareIcons(
              next.markers?.flatMap(({ icon }) =>
                icon ? [Number(icon)] : [],
              ) ?? [],
            )
            if (disposed) return
            await displayMap(
              map,
              next,
              library,
              shadow.getElementById('title') as HTMLElement,
            )
            if (disposed) return
            if (adapter.name === 'Mojito' && backgroundMap !== next.map) {
              backgroundMap = next.map
              backgroundWatch?.abort()
              backgroundWatch = new AbortController()
              backgroundStatus.hidden = true
              const url = library.loader.getMapUrl(map.mapInfo.id)
              const image = Array.from(
                shadow.querySelectorAll<HTMLImageElement>(
                  '.leaflet-overlay-pane img.leaflet-image-layer',
                ),
              ).find((layer) => layer.getAttribute('src') === url)
              if (image)
                watchBackground(image, url, backgroundWatch.signal, () => {
                  backgroundStatus.hidden = false
                })
              else backgroundStatus.hidden = false
            }
            if (!disposed) setError(undefined)
          }
        }
        void drain()
          .catch(failed)
          .finally(() => {
            updating = false
          })
      }
      update.current(latest.current)
    }
    void initialize().catch(failed)
    return () => {
      disposed = true
      backgroundWatch?.abort()
      cancelAnimationFrame(sizeFrame)
      session?.dispose()
      update.current = undefined
      mapElement.removeEventListener('click', blockMapLink, true)
      resize.disconnect()
      instance?.remove()
    }
  }, [])
  useEffect(() => {
    update.current?.(value)
  }, [value])
  return (
    <>
      {error && (
        <div role="status" className="map-error">
          {error}
        </div>
      )}
      <div
        ref={host}
        style={{
          display: error ? 'none' : undefined,
          border: 0,
          background: 'transparent',
          height: '100%',
          width: '100%',
        }}
      />
    </>
  )
}

function watchBackground(
  image: HTMLImageElement,
  url: string,
  signal: AbortSignal,
  failed: () => void,
) {
  if (image.complete && image.naturalWidth > 0) return
  let retried = false
  const retry = () => {
    if (retried) {
      failed()
      return
    }
    retried = true
    // Let other map resources finish before requesting the same authorized image again.
    const timer = setTimeout(() => {
      if (!signal.aborted) {
        image.removeAttribute('src')
        image.src = url
      }
    }, 250)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  }
  image.addEventListener('error', retry, { signal })
  if (image.complete) retry()
}
