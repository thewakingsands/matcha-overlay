export interface ExplorationContext {
  sessionId: string | null
  characterGeneration: number
  clockGeneration: number
  zoneEpoch: number
  catalogRevision: number
  territoryId: number | null
}
/** Where the player is, whether or not there is a treasure map. Its content only changes when something shown does. */
export interface LocationState {
  context: ExplorationContext
  status: 'ready' | 'waiting' | 'unavailable'
  reason: string | null
  territoryId: number | null
  /** The map to show: the default map of the territory */
  mapId: number | null
  /** Whether the player is on that map; a territory with several maps does not tell */
  floorConfirmed: boolean
  kind: 'field' | 'town' | 'eureka' | 'other' | null
  player: { x: number; y: number; headingDegrees: number | null } | null
}
export interface NavigationState {
  context: ExplorationContext
  status: 'ready' | 'no-target' | 'waiting' | 'other-territory' | 'unavailable'
  reason: string | null
  /** When the current treasure map was first reported; a map opened again after it was cleared gets a new time */
  targetSince: number | null
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
    /** The aetheryte of the treasure's territory nearest in three dimensions, placed on the treasure's map */
    aetheryte: {
      name: string
      distanceM: number
      position: { mapId: number; x: number; y: number } | null
    } | null
  } | null
  player: {
    x: number
    y: number
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
  /** An open window has no future opening time. */
  opensAt: number | null
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
  location: LocationState | null
  navigation: NavigationState | null
  hunts: HuntState | null
  eureka: EurekaState | null
}
