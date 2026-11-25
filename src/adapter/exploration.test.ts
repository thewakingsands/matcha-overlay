import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearExploration,
  getExplorationState,
  receiveExploration,
} from './exploration'
import type {
  ExplorationContext,
  HuntState,
  LocationState,
  NavigationState,
} from './exploration-types'

const context: ExplorationContext = {
  sessionId: 'synthetic',
  characterGeneration: 0,
  clockGeneration: 0,
  zoneEpoch: 1,
  catalogRevision: 1,
  territoryId: 100,
}
const navigation: NavigationState = {
  context,
  status: 'no-target',
  reason: null,
  targetSince: null,
  target: null,
  player: null,
  guidance: null,
}
const hunts: HuntState = {
  context,
  status: 'ready',
  reason: null,
  mapId: 1,
  entries: [],
}
const location: LocationState = {
  context,
  status: 'ready',
  reason: null,
  territoryId: 100,
  mapId: 1,
  floorConfirmed: true,
  kind: 'field',
  player: { x: 10, y: 10, headingDegrees: 0 },
}
beforeEach(clearExploration)
describe('optional Mojito exploration state', () => {
  it('retains independent full states for the same exploration context', () => {
    receiveExploration('NavigationState', navigation)
    receiveExploration('HuntState', hunts)
    receiveExploration('NavigationState', {
      ...navigation,
      targetSince: 11000,
    })
    expect(getExplorationState().hunts).toEqual(hunts)
    expect(getExplorationState().navigation?.targetSince).toBe(11000)
  })
  it('clears other kinds on a region boundary and rejects late older generations', () => {
    receiveExploration('NavigationState', navigation)
    receiveExploration('HuntState', {
      ...hunts,
      context: { ...context, zoneEpoch: 2 },
    })
    expect(getExplorationState().navigation).toBeNull()
    receiveExploration('NavigationState', navigation)
    expect(getExplorationState().navigation).toBeNull()
  })
  it('clears all new state on Reset, disconnect and catalog changes', () => {
    receiveExploration('HuntState', hunts)
    receiveExploration('Reset', null)
    expect(getExplorationState().hunts).toBeNull()
    receiveExploration('HuntState', hunts)
    receiveExploration('NavigationState', {
      ...navigation,
      context: { ...context, catalogRevision: 2 },
    })
    expect(getExplorationState().hunts).toBeNull()
    clearExploration()
    expect(getExplorationState().navigation).toBeNull()
  })
  it.each([
    ['zone', { zoneEpoch: 2, territoryId: 200 }],
    ['character', { characterGeneration: 1 }],
    ['replay position', { clockGeneration: 1 }],
  ])(
    'shows the location of a new %s alone, and drops what arrives late from the old one',
    (_, change) => {
      receiveExploration('LocationState', location)
      receiveExploration('HuntState', hunts)
      expect(getExplorationState()).toMatchObject({ location, hunts })
      const next = { ...location, context: { ...context, ...change } }
      receiveExploration('LocationState', next)
      expect(getExplorationState()).toEqual({
        location: next,
        navigation: null,
        hunts: null,
        eureka: null,
      })
      receiveExploration('HuntState', hunts)
      receiveExploration('NavigationState', navigation)
      expect(getExplorationState().hunts).toBeNull()
      expect(getExplorationState().navigation).toBeNull()
    },
  )
  it('keeps the other states when only the position in the location changes', () => {
    receiveExploration('HuntState', hunts)
    receiveExploration('LocationState', location)
    receiveExploration('LocationState', {
      ...location,
      player: { x: 11, y: 10, headingDegrees: 90 },
    })
    expect(getExplorationState().hunts).toEqual(hunts)
    expect(getExplorationState().location?.player?.x).toBe(11)
  })
  it('leaves ACT and incomplete payloads without invented new data', () => {
    receiveExploration('TreasureSpot', { item: 1, location: 0 })
    receiveExploration('HuntState', { context })
    expect(getExplorationState()).toEqual({
      location: null,
      navigation: null,
      hunts: null,
      eureka: null,
    })
  })
})
