import { expect, it } from 'vitest'
import type {
  EurekaEntry,
  EurekaState,
  ExplorationContext,
  ExplorationStates,
  HuntEntry,
  HuntState,
  LocationState,
  NavigationState,
} from '../../../adapter/exploration-types'
import {
  bringsForward,
  initialView,
  monsterName,
  panelWidth,
  scene,
  type View,
} from './model'

const context: ExplorationContext = {
  sessionId: 'synthetic',
  characterGeneration: 0,
  clockGeneration: 0,
  zoneEpoch: 1,
  catalogRevision: 1,
  territoryId: 100,
  clock: {
    now: 10000,
    base: 'packet-unix',
    generation: 0,
    source: 'live',
    paused: false,
  },
}
const location = (change: Partial<LocationState> = {}): LocationState => ({
  context,
  status: 'ready',
  reason: null,
  territoryId: 100,
  mapId: 1,
  floorConfirmed: true,
  kind: 'field',
  player: { x: 10, y: 10, headingDegrees: 90 },
  ...change,
})
const target = (
  change: Partial<NonNullable<NavigationState['target']>> = {},
) => ({
  itemId: 7,
  spotIndex: 0,
  levelId: 1,
  territoryId: 100,
  mapId: 1,
  placeName: '奥阔帕恰山',
  x: 20,
  y: 12,
  z: 0.7,
  zStatus: 'known' as const,
  aetheryte: {
    name: '瓦丘恩佩洛',
    distanceM: 155.4,
    position: { mapId: 1, x: 18, y: 14 },
  },
  ...change,
})
const navigation = (
  change: Partial<NavigationState> = {},
): NavigationState => ({
  context,
  status: 'ready',
  reason: null,
  targetSince: 5000,
  target: target(),
  player: null,
  guidance: null,
  ...change,
})
const hunt = (change: Partial<HuntEntry> = {}): HuntEntry => ({
  actorId: 1,
  bNpcBase: 1,
  bNpcName: 1,
  name: '内丘奇霍',
  rank: 'A',
  state: 'observed',
  position: { mapId: 1, x: 15, y: 15 },
  lastObservedAt: 9000,
  hpPercent: 100,
  distanceM: 348,
  heightDifferenceM: 0,
  ...change,
})
const hunts = (entries: HuntEntry[], mapId = 1): HuntState => ({
  context,
  status: 'ready',
  reason: null,
  mapId,
  entries,
})
const monster = (fateId: number, name: string): EurekaEntry => ({
  fateId,
  name,
  position: { mapId: 1, x: fateId, y: 6 },
  activity: 'unknown',
  progress: null,
  activityEndsAt: null,
  cooldown: { basis: null, referenceAt: null, durationMs: null, readyAt: null },
  conditions: {
    weatherId: null,
    weatherName: null,
    nightOnly: false,
    status: 'unknown',
    environmentWindow: null,
    estimatedWindow: null,
    otherConditionsUnknown: false,
  },
})
const eureka = (mapId = 1): EurekaState => ({
  context,
  status: 'ready',
  reason: null,
  mapId,
  entries: [monster(1404, '炎蝶的女王——彭忒西勒亚'), monster(1396, '火巨人')],
})
const everything = (change: Partial<ExplorationStates> = {}) => ({
  location: location(),
  navigation: navigation(),
  hunts: hunts([hunt()]),
  eureka: eureka(),
  ...change,
})
const show = (states: ExplorationStates, view: View = initialView) =>
  scene(states, view, 167)
const ids = (states: ExplorationStates, view?: View) =>
  show(states, view).map?.markers?.map(({ id }) => id)

it('lists per kind of zone only what is valid there', () => {
  const groups = (kind: LocationState['kind']) => {
    const { treasure, hunts, eureka, panel } = show(
      everything({ location: location({ kind }) }),
    )
    return { treasure: !!treasure, hunts: hunts.length, nm: !!eureka, panel }
  }
  expect(groups('field')).toEqual({
    treasure: true,
    hunts: 1,
    nm: false,
    panel: true,
  })
  expect(groups('town')).toEqual({
    treasure: true,
    hunts: 0,
    nm: false,
    panel: true,
  })
  expect(groups('eureka')).toEqual({
    treasure: false,
    hunts: 0,
    nm: true,
    panel: true,
  })
  expect(groups('other')).toEqual({
    treasure: false,
    hunts: 0,
    nm: false,
    panel: false,
  })
  expect(groups(null)).toEqual({
    treasure: false,
    hunts: 0,
    nm: false,
    panel: false,
  })
})

it('shows the map and the player alone when there is nothing to list', () => {
  const empty = show({
    location: location(),
    navigation: navigation({ target: null, targetSince: null }),
    hunts: hunts([hunt({ state: 'ended' })]),
    eureka: null,
  })
  expect(empty.panel).toBe(false)
  expect(empty.map).toMatchObject({
    map: 1,
    markers: [
      { id: 'player', kind: 'player', x: 10, y: 10, headingDegrees: 90 },
    ],
    viewport: { cover: true, insetRight: 0 },
    focus: { points: [{ x: 10, y: 10 }] },
  })
  expect(show(everything()).map?.viewport).toEqual({
    cover: true,
    insetRight: 183,
  })
})

it('leaves out hunts and monsters that are on another map than the one shown', () => {
  expect(show(everything({ hunts: hunts([hunt()], 2) })).hunts).toEqual([])
  expect(
    show(
      everything({ location: location({ kind: 'eureka' }), eureka: eureka(2) }),
    ).eureka,
  ).toBeNull()
  // A hunt target seen on another map of the zone stays in the list, without a marker.
  const elsewhere = everything({
    hunts: hunts([hunt({ position: { mapId: 2, x: 1, y: 1 } })]),
  })
  expect(show(elsewhere).hunts).toHaveLength(1)
  expect(ids(elsewhere)).toEqual(['treasure', 'player'])
})

it('marks a treasure map on this map with the line to it and centres it with the player', () => {
  const here = show(everything())
  expect(here.treasure?.here).toBe(true)
  expect(here.selection).toEqual({ kind: 'treasure' })
  expect(here.map).toMatchObject({
    line: [
      { x: 20, y: 12 },
      { x: 10, y: 10 },
    ],
    focus: {
      points: [
        { x: 20, y: 12 },
        { x: 10, y: 10 },
      ],
      primary: { x: 20, y: 12 },
    },
  })
  expect(ids(everything())).toEqual(['hunt:1', 'treasure', 'player'])
})

it('keeps the current map for a treasure map elsewhere, and shows its map on request until the map changes', () => {
  // Another map of the same territory counts as elsewhere too.
  const states = everything({
    navigation: navigation({ target: target({ mapId: 2 }) }),
  })
  const remote = show(states)
  expect(remote.treasure?.here).toBe(false)
  expect(remote.mapId).toBe(1)
  expect(remote.map?.line).toBeUndefined()
  expect(ids(states)).toEqual(['hunt:1', 'player'])
  expect(remote.selection).toEqual({ kind: 'player' })

  const view: View = {
    ...initialView,
    mapId: 1,
    since: 5000,
    viewing: true,
    revision: 1,
  }
  const viewing = show(
    everything({
      navigation: navigation({
        target: target({
          mapId: 2,
          aetheryte: {
            name: '瓦丘恩佩洛',
            distanceM: 155.4,
            position: { mapId: 2, x: 18, y: 14 },
          },
        }),
      }),
    }),
    view,
  )
  expect(viewing).toMatchObject({ mapId: 2, viewing: true, note: null })
  expect(viewing.map).toMatchObject({
    map: 2,
    markers: [
      {
        id: 'aetheryte',
        x: 18,
        y: 14,
        ring: true,
        title: '瓦丘恩佩洛 · 155 m',
      },
      { id: 'treasure', x: 20, y: 12 },
    ],
    focus: {
      points: [
        { x: 20, y: 12 },
        { x: 18, y: 14 },
      ],
      primary: { x: 20, y: 12 },
    },
  })
  expect(viewing.map?.focus?.key).not.toBe(remote.map?.focus?.key)

  // An aetheryte that cannot be placed on that map leaves the treasure alone.
  expect(ids(states, view)).toEqual(['treasure'])
  expect(show(states, view).map?.focus?.points).toEqual([{ x: 20, y: 12 }])

  // Entering another map, or opening another treasure map, ends it.
  const moved = everything({
    location: location({ mapId: 3 }),
    navigation: navigation({ target: target({ mapId: 2 }) }),
  })
  expect(show(moved, view)).toMatchObject({ mapId: 3, viewing: false })
  const reopened = {
    ...states,
    navigation: { ...states.navigation, targetSince: 6000 },
  }
  expect(show(reopened as ExplorationStates, view)).toMatchObject({
    mapId: 1,
    viewing: false,
  })
})

it('centres the chosen entry, and the player when the entry has gone', () => {
  const view: View = {
    ...initialView,
    mapId: 1,
    since: 5000,
    selection: { kind: 'hunt', id: 1 },
    revision: 2,
  }
  const chosen = show(everything(), view)
  expect(chosen.selection).toEqual({ kind: 'hunt', id: 1 })
  expect(chosen.map?.focus).toMatchObject({
    points: [
      { x: 15, y: 15 },
      { x: 10, y: 10 },
    ],
    primary: { x: 15, y: 15 },
  })
  expect(chosen.map?.markers?.[0]).toMatchObject({
    id: 'hunt:1',
    title: '内丘奇霍',
  })
  expect(show(everything({ hunts: hunts([]) }), view).selection).toEqual({
    kind: 'player',
  })
  // Asking again for the same entry centres the map again.
  expect(show(everything(), { ...view, revision: 3 }).map?.focus?.key).not.toBe(
    chosen.map?.focus?.key,
  )

  const island = everything({ location: location({ kind: 'eureka' }) })
  const nm = show(island, { ...view, selection: { kind: 'nm', id: 1404 } })
  expect(nm.map?.markers?.slice(0, 2)).toMatchObject([
    { id: 'nm:1396', compact: true, title: undefined },
    { id: 'nm:1404', compact: false, title: '彭忒西勒亚' },
  ])
  expect(monsterName('火巨人')).toBe('火巨人')
})

it('draws no player on an unconfirmed floor and treats the treasure map as elsewhere', () => {
  const floor = show(
    everything({
      location: location({
        status: 'unavailable',
        reason: '当前所在的地图未确认',
        floorConfirmed: false,
        player: null,
      }),
    }),
  )
  expect(floor).toMatchObject({
    mapId: 1,
    note: '当前所在的地图未确认',
    treasure: { here: false },
    hunts: [{ actorId: 1 }],
  })
  expect(floor.map?.markers?.map(({ id }) => id)).toEqual(['hunt:1'])
  // A map without a note: the position is merely not read yet.
  expect(
    show(
      everything({
        location: location({
          status: 'unavailable',
          reason: '本人位置不可用',
          player: null,
        }),
      }),
    ).note,
  ).toBeNull()
})

it('says why there is no map', () => {
  expect(
    show({ location: null, navigation: null, hunts: null, eureka: null }),
  ).toMatchObject({
    mapId: null,
    map: null,
    status: '正在读取地图资料',
  })
  expect(
    show(
      everything({
        location: location({
          mapId: null,
          status: 'unavailable',
          reason: '区域地图关联尚未确认',
        }),
      }),
    ),
  ).toMatchObject({ map: null, status: '区域地图关联尚未确认', hunts: [] })
})

it('comes forward for a newly opened treasure map only', () => {
  const held = navigation()
  // The first state after the page loads is a restored snapshot.
  expect(bringsForward(null, held)).toBe(false)
  // The game sends the same map again on every zone change.
  expect(bringsForward({ since: 5000 }, held)).toBe(false)
  expect(
    bringsForward({ since: 5000 }, navigation({ targetSince: 6000 })),
  ).toBe(true)
  // Nothing in hand when the page loaded, then the first map.
  expect(bringsForward({ since: null }, held)).toBe(true)
  expect(
    bringsForward(
      { since: 5000 },
      navigation({ target: null, targetSince: null }),
    ),
  ).toBe(false)
})

it('sizes the panel from the frame', () => {
  expect(panelWidth(440)).toBe(167)
  expect(panelWidth(300)).toBe(156)
  expect(panelWidth(900)).toBe(220)
})
