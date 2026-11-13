import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearExploration,
  getExplorationState,
  receiveExploration,
} from './exploration'
import type {
  ExplorationContext,
  HuntState,
  NavigationState,
} from './exploration-types'

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
    source: 'replay',
    paused: true,
  },
}
const navigation: NavigationState = {
  context,
  status: 'no-target',
  reason: null,
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
beforeEach(clearExploration)
describe('optional Mojito exploration state', () => {
  it('retains independent full states without treating clock ticks as resets', () => {
    receiveExploration('NavigationState', navigation)
    receiveExploration('HuntState', hunts)
    receiveExploration('NavigationState', {
      ...navigation,
      context: { ...context, clock: { ...context.clock, now: 11000 } },
    })
    expect(getExplorationState().hunts).toEqual(hunts)
    expect(getExplorationState().navigation?.context.clock.now).toBe(11000)
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
  it('leaves ACT and incomplete payloads without invented new data', () => {
    receiveExploration('TreasureSpot', { item: 1, location: 0 })
    receiveExploration('HuntState', { context })
    expect(getExplorationState()).toEqual({
      navigation: null,
      hunts: null,
      eureka: null,
    })
  })
})
