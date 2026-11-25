import clsx from 'clsx'
import { LocateFixed } from 'lucide-react'
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  getExplorationState,
  subscribeExploration,
} from '../../../adapter/exploration'
import { EorzeaMap } from '../../../components/map'
import { Maps } from '../../../data/maps'
import { itemName, queryItem } from '../../../lib/store/item'
import type { OverlayProps } from '../../interface'
import { Events } from './events'
import {
  bringsForward,
  initialView,
  panelWidth,
  type Selection,
  scene,
} from './model'
import './index.css'

// Outlives the component, which is built again whenever the client data is.
let seen: { since: number | null } | null = null

function useItemName(id: number | undefined, language: string) {
  const [name, setName] = useState<{ id: number; name: string }>()
  useEffect(() => {
    if (!id) return
    let stopped = false
    queryItem(id, language)
      .then((item) => {
        if (!stopped) setName({ id, name: itemName(item, language) })
      })
      .catch(console.error)
    return () => {
      stopped = true
    }
  }, [id, language])
  return name && name.id === id ? name.name : ''
}

/** The map the player is on, with what is worth knowing there in a panel on its right */
export function MapOverlay({ active, setActive, language }: OverlayProps) {
  const states = useSyncExternalStore(subscribeExploration, getExplorationState)
  const { location, navigation, hunts, eureka } = states
  const [view, setView] = useState(initialView)
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: The frame only exists while the feature is shown.
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [active])

  const since = navigation ? navigation.targetSince : undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only a newly opened treasure map brings the map forward.
  useEffect(() => {
    if (!navigation) return
    if (bringsForward(seen, navigation) && !active) setActive()
    seen = { since: navigation.targetSince }
  }, [since])

  const panel = panelWidth(width)
  const current = useMemo(
    () => scene(states, view, panel),
    [states, view, panel],
  )
  const treasureName = useItemName(current.treasure?.target.itemId, language)
  if (!active) return null

  const choose = (selection: Selection, viewing = false) =>
    setView(({ revision }) => ({
      mapId: location?.mapId ?? null,
      since: navigation?.targetSince ?? null,
      selection,
      revision: revision + 1,
      viewing,
    }))
  return (
    <div
      ref={frame}
      className="overlay overlay-map"
      style={
        { '--map-panel': `${current.panel ? panel : 0}px` } as CSSProperties
      }
    >
      {current.map ? (
        <EorzeaMap {...current.map} />
      ) : (
        <p role="status" className="map-status">
          {current.status}
        </p>
      )}
      {current.mapId !== null && (
        <div className="map-labels">
          <p
            className={clsx(
              'map-place',
              current.viewing && 'map-place-viewing',
            )}
          >
            {Maps[current.mapId]?.name ||
              (current.viewing && current.treasure?.target.placeName)}
            {current.viewing && <span>宝图所在地图</span>}
          </p>
          {current.note && (
            <p role="status" className="map-note">
              {current.note}
            </p>
          )}
        </div>
      )}
      {current.map && (
        <button
          type="button"
          className="map-locate"
          aria-label="回到当前位置"
          title="回到当前位置"
          onClick={() => choose({ kind: 'player' })}
        >
          <LocateFixed />
        </button>
      )}
      {current.panel && (
        <aside className="map-events" aria-label="当前地图的事件">
          <Events
            scene={current}
            navigation={navigation}
            treasureName={treasureName || '宝图'}
            huntContext={hunts?.context}
            eurekaContext={eureka?.context}
            onSelect={choose}
            onView={(viewing) => choose({ kind: 'auto' }, viewing)}
          />
        </aside>
      )}
    </div>
  )
}
