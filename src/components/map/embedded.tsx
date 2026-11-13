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
      '<section class="erozea-map-outer"><div class="eorzea-map-glass"></div><div class="eorzea-map-inner" id="eorzea-map"></div><div class="eorzea-map-resize-handler"></div></section><span id="title" class="info"></span>'
    const syncSize = () => {
      const outer = shadow.querySelector<HTMLElement>(
        '.erozea-map-outer',
      ) as HTMLElement
      outer.style.width = `${element.clientWidth}px`
      outer.style.height = `${element.clientHeight}px`
      instance?.stop()
      instance?.invalidateSize({ animate: false })
    }
    const resize = new ResizeObserver(syncSize)
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
      const map = await library.create(
        shadow.getElementById('eorzea-map') as HTMLElement,
      )
      instance = map
      if (disposed) {
        instance.remove()
        return
      }
      syncSize()
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
      session?.dispose()
      update.current = undefined
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
