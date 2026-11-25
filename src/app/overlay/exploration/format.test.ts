import { describe, expect, it } from 'vitest'
import type { EurekaEntry, HuntEntry } from '../../../adapter/exploration-types'
import {
  conditionWindow,
  direction,
  eurekaActivity,
  heightDifference,
  observationAge,
  sortEureka,
  sortHunts,
  sourceTime,
} from './format'

const nm: EurekaEntry = {
  fateId: 1,
  name: 'Synthetic NM',
  position: null,
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
    otherConditionsUnknown: true,
  },
}
describe('exploration display semantics', () => {
  it('keeps zero and negative heights and hides undefined direction', () => {
    expect(heightDifference(0)).toBe('高度差 0 m')
    expect(heightDifference(-12)).toBe('低于你 12 m')
    expect(heightDifference(null)).toBe('高度差未知')
    expect([0, 90, 180, 270].map(direction)).toEqual(['北', '东', '南', '西'])
    expect(direction(null)).toBe('')
  })
  it('never turns an elapsed cooldown or an open condition into a spawned NM', () => {
    expect(eurekaActivity(nm, 10000)).toBe('尚未观察')
    expect(
      eurekaActivity(
        {
          ...nm,
          cooldown: {
            basis: 'first-observed',
            referenceAt: 1000,
            durationMs: 1000,
            readyAt: 2000,
          },
        },
        10000,
      ),
    ).toBe('估算冷却 已过')
    expect(eurekaActivity({ ...nm, activity: 'unconfirmed' }, 10000)).toBe(
      '状态待确认',
    )
    expect(eurekaActivity({ ...nm, activity: 'active' }, null)).toContain(
      '剩余时间未知',
    )
    expect(conditionWindow(null, 10000)).toBe('未知')
    expect(observationAge(0, null)).toBe('时间未知')
  })
  it('sorts current hunts before history and active NM before unknown entries', () => {
    const entry = {
      actorId: 1,
      state: 'last-seen',
      distanceM: null,
    } as HuntEntry
    expect(
      sortHunts([
        entry,
        { ...entry, actorId: 2, state: 'observed', distanceM: 30 },
      ]).map((row) => row.actorId),
    ).toEqual([2, 1])
    expect(
      sortEureka([nm, { ...nm, fateId: 2, activity: 'active' }], 10000).map(
        (row) => row.fateId,
      ),
    ).toEqual([2, 1])
  })
})

it('ignores a numeric time without a comparable source and orders ended NM by future windows', () => {
  const context = {
    sessionId: 'test',
    clockGeneration: 2,
    characterGeneration: 0,
    zoneEpoch: 1,
    catalogRevision: 1,
    territoryId: 732,
  }
  const clock = {
    sessionId: 'test',
    generation: 2,
    source: 'replay',
    now: 10000,
    paused: true,
  }
  expect(sourceTime(clock, context)).toBe(10000)
  expect(sourceTime({ ...clock, source: null }, context)).toBeNull()
  expect(
    sourceTime({ ...clock, sessionId: 'another-source' }, context),
  ).toBeNull()
  expect(sourceTime({ ...clock, generation: 1 }, context)).toBeNull()
  expect(sourceTime({ ...clock, now: null }, context)).toBeNull()
  const earlier = {
    ...nm,
    fateId: 2,
    activity: 'ended' as const,
    activityEndsAt: 9000,
    cooldown: { ...nm.cooldown, readyAt: 11000 },
  }
  const later = {
    ...nm,
    fateId: 1,
    activity: 'ended' as const,
    activityEndsAt: 1000,
    cooldown: { ...nm.cooldown, readyAt: 15000 },
  }
  expect(
    sortEureka([later, earlier], 10000).map((entry) => entry.fateId),
  ).toEqual([2, 1])
})

it('shows already open windows and sorts them using their closing edge', () => {
  const open = { opensAt: null, closesAt: 12000 }
  const future = { opensAt: 11000, closesAt: 13000 }
  expect(conditionWindow(open, 10000)).toBe('0:02 内')
  expect(conditionWindow(future, 10000)).toBe('0:01 后')
  expect(conditionWindow({ ...open, closesAt: null }, 10000)).toBe('当前满足')
  expect(conditionWindow(open, null)).toBe('未知')
  const rows = [
    {
      ...nm,
      fateId: 1,
      conditions: { ...nm.conditions, estimatedWindow: future },
    },
    {
      ...nm,
      fateId: 2,
      conditions: { ...nm.conditions, estimatedWindow: open },
    },
  ]
  expect(sortEureka(rows, 10000).map((entry) => entry.fateId)).toEqual([2, 1])
  expect(sortEureka(rows, 12000).map((entry) => entry.fateId)).toEqual([1, 2])
})
