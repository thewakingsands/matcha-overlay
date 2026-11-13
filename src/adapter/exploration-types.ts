import type { ClockState } from '@ffcafe/mojito-plugin-sdk'

export interface ExplorationContext {
  sessionId: string | null
  characterGeneration: number
  clockGeneration: number
  zoneEpoch: number
  catalogRevision: number
  territoryId: number | null
  clock: ClockState
}
export interface NavigationState {
  context: ExplorationContext
  status: 'ready' | 'no-target' | 'waiting' | 'other-territory' | 'unavailable'
  reason: string | null
  target: {
    itemId: number
    spotIndex: number
    levelId: number
    territoryId: number | null
    mapId: number
    placeName: string
    x: number
    y: number
    z: number | null
    zStatus: 'known' | 'hidden' | 'unavailable'
  } | null
  player: {
    x: number
    y: number
    observedAt: number
    headingDegrees: number | null
  } | null
  guidance: {
    distanceM: number
    heightDifferenceM: number | null
    bearingDegrees: number | null
    relativeDegrees: number | null
    near: boolean
  } | null
}
export interface HuntEntry {
  actorId: number
  bNpcBase: number
  bNpcName: number
  name: string
  rank: 'B' | 'A' | 'S' | 'SS' | null
  state: 'observed' | 'last-seen' | 'ended' | 'position-unknown'
  position: { mapId: number; x: number; y: number } | null
  lastObservedAt: number | null
  hpPercent: number | null
  distanceM: number | null
  heightDifferenceM: number | null
}
export interface HuntState {
  context: ExplorationContext
  status: 'ready' | 'waiting' | 'unavailable'
  reason: string | null
  mapId: number | null
  entries: HuntEntry[]
}
export interface TimeWindow {
  opensAt: number
  closesAt: number | null
}
export interface EurekaEntry {
  fateId: number
  name: string
  position: { mapId: number; x: number; y: number } | null
  activity: 'unknown' | 'active' | 'ended' | 'unconfirmed'
  progress: number | null
  activityEndsAt: number | null
  cooldown: {
    basis: 'fate-start' | 'first-observed' | null
    referenceAt: number | null
    durationMs: number | null
    readyAt: number | null
  }
  conditions: {
    weatherId: number | null
    weatherName: string | null
    nightOnly: boolean
    status: 'open' | 'waiting' | 'unknown'
    environmentWindow: TimeWindow | null
    estimatedWindow: TimeWindow | null
    otherConditionsUnknown: boolean
  }
}
export interface EurekaState {
  context: ExplorationContext
  status: 'ready' | 'outside' | 'waiting' | 'unavailable'
  reason: string | null
  mapId: number | null
  entries: EurekaEntry[]
}
export interface ExplorationStates {
  navigation: NavigationState | null
  hunts: HuntState | null
  eureka: EurekaState | null
}
