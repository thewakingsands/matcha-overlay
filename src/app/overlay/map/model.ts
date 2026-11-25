import type {
  EurekaEntry,
  ExplorationStates,
  HuntEntry,
  NavigationState,
} from '../../../adapter/exploration-types'
import type { MapInfo } from '../../../components/map'
import { MapIcon, type Marker } from '../../../map/interface'
import { sortHunts } from '../exploration/format'

/** What the map is centred on: `auto` is the treasure map when it is on this map, else the player */
export type Selection =
  | { kind: 'auto' | 'player' | 'treasure' }
  | { kind: 'hunt' | 'nm'; id: number }

/**
 * What the user chose, with the map and the treasure map it was chosen for: it lapses when the player enters
 * another map or a new treasure map is opened
 */
export interface View {
  mapId: number | null
  since: number | null
  selection: Selection
  /** Counts the requests to centre the map, so that asking again for the same thing centres it again */
  revision: number
  /** Looking at the map of a treasure map that is elsewhere */
  viewing: boolean
}
export const initialView: View = {
  mapId: null,
  since: null,
  selection: { kind: 'auto' },
  revision: 0,
  viewing: false,
}

type Target = NonNullable<NavigationState['target']>
export interface Scene {
  /** The map shown; null while there is none to show, with `status` saying why */
  mapId: number | null
  status: string | null
  /** Shown under the place name: why the player is not drawn */
  note: string | null
  viewing: boolean
  /** `here`: on the map the player is on, so that direction and distance apply */
  treasure: { target: Target; here: boolean } | null
  hunts: HuntEntry[]
  eureka: { entries: EurekaEntry[]; reason: string | null } | null
  selection: Selection
  /** Whether there is anything for the event panel */
  panel: boolean
  map: MapInfo | null
}

/** The part of a FATE name that names the monster: "炎热霸主——火巨人" is 火巨人 */
export const monsterName = (name: string) => name.split('——').at(-1) || name

export function scene(
  { location, navigation, hunts, eureka }: ExplorationStates,
  view: View,
  panelWidth: number,
): Scene {
  const current = location?.mapId ?? null
  const kind = location?.kind ?? null
  const player = location?.player ?? null
  const target =
    kind === 'field' || kind === 'town' ? (navigation?.target ?? null) : null
  const here =
    !!target && target.mapId === current && !!location?.floorConfirmed
  const huntEntries =
    kind === 'field' && current !== null && hunts?.mapId === current
      ? sortHunts(hunts.entries.filter((entry) => entry.state !== 'ended'))
      : []
  const monsters =
    kind === 'eureka' && current !== null && eureka?.mapId === current
      ? eureka.entries
      : null
  const chosen =
    view.mapId === current && view.since === (navigation?.targetSince ?? null)
      ? view
      : initialView
  const viewing = chosen.viewing && !!target && !here
  const mapId = viewing ? target.mapId : current
  const on = <T extends { mapId: number; x: number; y: number }>(
    position: T | null | undefined,
  ) => (position?.mapId === mapId ? position : null)

  let selection = chosen.selection
  let primary: { x: number; y: number } | null = null
  if (viewing) selection = { kind: 'treasure' }
  else {
    if (selection.kind === 'auto')
      selection = { kind: here ? 'treasure' : 'player' }
    const { kind: chosenKind } = selection
    const id = 'id' in selection ? selection.id : null
    if (chosenKind === 'treasure') primary = here ? target : null
    else if (chosenKind === 'hunt')
      primary = on(huntEntries.find((entry) => entry.actorId === id)?.position)
    else if (chosenKind === 'nm')
      primary = on(monsters?.find((entry) => entry.fateId === id)?.position)
    if (!primary) selection = { kind: 'player' }
  }

  const markers: Marker[] = []
  const selected = (kind: 'hunt' | 'nm', id: number) =>
    selection.kind === kind && 'id' in selection && selection.id === id
  if (viewing) {
    const aetheryte = target.aetheryte
    const position = on(aetheryte?.position ?? null)
    if (aetheryte && position)
      markers.push({
        id: 'aetheryte',
        icon: MapIcon.Aetheryte,
        x: position.x,
        y: position.y,
        ring: true,
        title: `${aetheryte.name} · ${Math.round(aetheryte.distanceM)} m`,
      })
    markers.push({
      id: 'treasure',
      icon: MapIcon.Treasure,
      x: target.x,
      y: target.y,
    })
    primary = target
  } else {
    for (const entry of monsters ?? []) {
      const position = on(entry.position)
      if (position)
        markers.push({
          id: `nm:${entry.fateId}`,
          icon: MapIcon.Fate,
          x: position.x,
          y: position.y,
          compact: !selected('nm', entry.fateId),
          title: selected('nm', entry.fateId)
            ? monsterName(entry.name)
            : undefined,
        })
    }
    for (const entry of huntEntries) {
      const position = on(entry.position)
      if (position)
        markers.push({
          id: `hunt:${entry.actorId}`,
          kind: entry.state === 'observed' ? 'observed' : 'history',
          x: position.x,
          y: position.y,
          title: selected('hunt', entry.actorId) ? entry.name : undefined,
        })
    }
    if (here)
      markers.push({
        id: 'treasure',
        icon: MapIcon.Treasure,
        x: target.x,
        y: target.y,
      })
    if (player)
      markers.push({
        id: 'player',
        kind: 'player',
        x: player.x,
        y: player.y,
        headingDegrees: player.headingDegrees,
      })
  }

  const aetheryte = viewing
    ? markers.find(({ id }) => id === 'aetheryte')
    : null
  const points = viewing
    ? [target, ...(aetheryte ? [aetheryte] : [])]
    : [...(primary ? [primary] : []), ...(player ? [player] : [])]
  const panel = !!target || huntEntries.length > 0 || !!monsters
  return {
    mapId,
    status: mapId === null ? (location?.reason ?? '正在读取地图资料') : null,
    note:
      mapId !== null && !viewing && location && !location.floorConfirmed
        ? location.reason
        : null,
    viewing,
    treasure: target ? { target, here } : null,
    hunts: huntEntries,
    eureka: monsters
      ? {
          entries: monsters,
          reason: eureka?.status === 'ready' ? null : (eureka?.reason ?? null),
        }
      : null,
    selection,
    panel,
    map:
      mapId === null
        ? null
        : {
            map: mapId,
            markers,
            line: here && player && !viewing ? [target, player] : undefined,
            focus: {
              key: [
                location?.context.zoneEpoch,
                mapId,
                selection.kind,
                'id' in selection ? selection.id : '',
                chosen.revision,
                navigation?.targetSince,
                !!player,
              ].join(':'),
              points: points.map(({ x, y }) => ({ x, y })),
              primary: primary ? { x: primary.x, y: primary.y } : undefined,
            },
            viewport: { cover: true, insetRight: panel ? panelWidth + 16 : 0 },
          },
  }
}

/** The width of the event panel in a frame this wide */
export const panelWidth = (frameWidth: number) =>
  Math.round(Math.min(220, Math.max(156, frameWidth * 0.38)))

/**
 * Whether a navigation state brings the map forward: only a treasure map that was not there in the state before.
 * The first state after the page loads is a restored snapshot and is only remembered.
 */
export function bringsForward(
  seen: { since: number | null } | null,
  navigation: NavigationState,
) {
  return (
    seen !== null &&
    navigation.targetSince !== null &&
    navigation.targetSince !== seen.since
  )
}
