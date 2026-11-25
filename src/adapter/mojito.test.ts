import type {
  BatchListener,
  Subscription,
  Value,
} from '@ffcafe/mojito-plugin-sdk'
import { connectView, type ViewBridge } from '@ffcafe/mojito-plugin-sdk/view'
import { describe, expect, it, vi } from 'vitest'
import { displayClockTime } from '../app/overlay/fishing/clock'
import { isMojitoSource } from './index'
import {
  adapter,
  envelope,
  getItemDataSource,
  getMapDataGeneration,
  getSourceClock,
  type MatchaEnvelope,
  subscribeMojito,
  updateSourceData,
  watchItemDataSource,
  watchMapDataGeneration,
} from './mojito'

vi.mock('@ffcafe/mojito-plugin-sdk/view', () => ({ connectView: vi.fn() }))

const event = (sequence: number): MatchaEnvelope => ({
  sequence,
  type: 'Gearset',
  content: { slot: 1 },
  timestamp: 123,
})
describe('Matcha data-source adapter', () => {
  it('notifies rendered item consumers on source changes, language changes and lost data access', () => {
    updateSourceData({ dataSourceInfo: null })
    const listener = vi.fn()
    const stop = watchItemDataSource(listener)
    updateSourceData({
      dataSourceInfo: { revision: 'one', build: '7.57', language: 'chs' },
    })
    const first = getItemDataSource()
    updateSourceData({
      dataSourceInfo: { revision: 'one', build: '7.57', language: 'chs' },
    })
    expect(getItemDataSource()).toBe(first)
    expect(listener).toHaveBeenCalledTimes(1)
    updateSourceData({
      dataSourceInfo: { revision: 'two', build: '7.57', language: 'chs' },
    })
    expect(getItemDataSource()?.revision).toBe('two')
    updateSourceData({
      dataSourceInfo: { revision: 'three', build: '7.57', language: 'ja' },
    })
    expect(getItemDataSource()?.language).toBe('ja')
    updateSourceData({ dataSourceInfo: null })
    expect(getItemDataSource()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(4)
    stop()
  })
  it('keeps ordinary ACT pages on ACT and selects only explicit Mojito views', () => {
    expect(
      isMojitoSource({
        protocol: 'https:',
        search: '?OVERLAY_WS=ws%3A%2F%2Flocalhost%3A10501%2Fws',
      }),
    ).toBe(false)
    expect(isMojitoSource({ protocol: 'mojito-plugin:', search: '' })).toBe(
      true,
    )
    expect(
      isMojitoSource({ protocol: 'http:', search: '?source=mojito' }),
    ).toBe(true)
  })
  it('rejects malformed event framing', () => {
    expect(envelope({ ...event(1), sequence: 1.5 })).toBeNull()
    expect(envelope({ ...event(1), timestamp: NaN })).toBeNull()
    expect(
      envelope({ type: 'Gearset', sequence: 1, timestamp: 123 }),
    ).toBeNull()
    expect(envelope(event(1))).toEqual(event(1))
  })
  it('applies snapshot before live arrivals without replaying stale buffered updates', async () => {
    let receive!: BatchListener<Value>
    let resolve!: (value: Value) => void
    const ready = Promise.resolve()
    const dispose = vi.fn()
    const subscription: Subscription = {
      ready,
      dispose,
      closed: new Promise(() => {}),
    }
    const bridge = {
      subscribe: vi.fn((_channel, listener: BatchListener<Value>) => {
        receive = listener
        return subscription
      }),
      snapshot: vi.fn(
        () =>
          new Promise<Value>((done) => {
            resolve = done
          }),
      ),
    } as unknown as ViewBridge
    const seen: number[] = []
    const pending = subscribeMojito(bridge, (value) =>
      seen.push(value.sequence),
    )
    await Promise.resolve()
    const batch = (items: MatchaEnvelope[]) => ({
      subscriptionId: 'test',
      batchId: 1,
      firstSeq: 1,
      lastSeq: 1,
      initial: false,
      complete: true,
      items: items as unknown as Value[],
    })
    await receive(batch([event(1), event(3), event(4)]))
    resolve({ events: [event(2), event(3)] as unknown as Value[] })
    await pending
    await receive(batch([event(4), event(5)]))
    expect(seen).toEqual([2, 3, 4, 5])
    expect(dispose).not.toHaveBeenCalled()
  })
  it('disposes the stream if the initial state cannot be loaded', async () => {
    const dispose = vi.fn()
    const bridge = {
      subscribe: () => ({
        ready: Promise.resolve(),
        dispose,
        closed: new Promise(() => {}),
      }),
      snapshot: () => Promise.reject(new Error('stopped')),
    } as unknown as ViewBridge
    await expect(subscribeMojito(bridge, () => {})).rejects.toThrow('stopped')
    expect(dispose).toHaveBeenCalledOnce()
  })
  it('clears materialized UI state and restores a snapshot after a missing sequence', async () => {
    let receive!: BatchListener<Value>
    const snapshot = vi
      .fn()
      .mockResolvedValueOnce({ events: [event(1)] })
      .mockResolvedValueOnce({ events: [event(3)] })
    const bridge = {
      subscribe: (_: string, listener: BatchListener<Value>) => {
        receive = listener
        return {
          ready: Promise.resolve(),
          dispose: vi.fn(),
          closed: new Promise(() => {}),
        }
      },
      snapshot,
    } as unknown as ViewBridge
    const seen: string[] = []
    await subscribeMojito(bridge, (item) =>
      seen.push(`${item.type}:${item.sequence}`),
    )
    await receive({
      subscriptionId: 'test',
      batchId: 1,
      firstSeq: 1,
      lastSeq: 1,
      initial: false,
      complete: true,
      items: [event(3)] as unknown as Value[],
    })
    expect(seen).toEqual(['Gearset:1', 'Reset:1', 'Gearset:3'])
    expect(snapshot).toHaveBeenCalledTimes(2)
  })
  it('uses retained status across content restore, source changes, and reopening', async () => {
    vi.stubGlobal('window', { fetch: globalThis.fetch })
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    const batch = (items: Value[], initial = false) => ({
      subscriptionId: 'test',
      batchId: 1,
      firstSeq: 1,
      lastSeq: 1,
      initial,
      complete: true,
      items,
    })
    const status = (
      sessionId: string,
      generation: number,
      now: number,
      paused = false,
    ) => ({
      session: {
        sessionId,
        clock: { generation, now, paused, source: 'replay' },
      },
    })
    const connect = (initial: Value[]) => {
      const listeners = new Map<string, BatchListener<Value>>()
      const listener = (channel: string) => {
        const receive = listeners.get(channel)
        if (!receive) throw new Error(`Missing subscription for ${channel}`)
        return receive
      }
      let closeStatus!: (result: { reason: 'disposed' }) => void
      const closed = new Promise<{ reason: 'disposed' }>((resolve) => {
        closeStatus = resolve
      })
      const snapshot = vi.fn(async () => ({
        ...status('old-snapshot', 1, 100),
        sequence: 1,
        events: [event(1)],
      }))
      vi.mocked(connectView).mockResolvedValueOnce({
        identity: { kind: 'overlay' },
        subscribe: (channel: string, listener: BatchListener<Value>) => {
          listeners.set(channel, listener)
          if (channel === 'matcha.status')
            queueMicrotask(() => void listener(batch(initial, true)))
          return {
            ready: Promise.resolve(),
            closed:
              channel === 'matcha.status' ? closed : new Promise(() => {}),
            dispose: vi.fn(),
          }
        },
        snapshot,
        command: vi.fn(async () => null),
      } as unknown as ViewBridge)
      return { listener, snapshot, closeStatus }
    }

    try {
      const first = connect([status('replay', 2, 101000)])
      await adapter.prepare()
      expect(getSourceClock()).toMatchObject({
        sessionId: 'replay',
        generation: 2,
        now: 101000,
      })
      await adapter.subscribeEvents(() => {})
      expect(first.snapshot).toHaveBeenCalledWith(
        'matcha.state',
        expect.anything(),
      )
      expect(getSourceClock()?.now).toBe(101000)

      const statusListener = first.listener('matcha.status')
      await statusListener(batch([status('replay', 2, 100900, true)]))
      expect(getSourceClock()).toMatchObject({ now: 100900, paused: true })
      first.snapshot.mockResolvedValueOnce({
        ...status('old-snapshot', 1, 500),
        sequence: 3,
        events: [event(3)],
      })
      await first.listener('matcha.events')(
        batch([event(3) as unknown as Value]),
      )
      expect(getSourceClock()).toMatchObject({ now: 100900, paused: true })

      await statusListener(batch([status('next', 3, 2000)]))
      expect(getSourceClock()).toMatchObject({
        sessionId: 'next',
        generation: 3,
        now: 2000,
      })
      first.closeStatus({ reason: 'disposed' })
      await Promise.resolve()
      expect(getSourceClock()).toBeNull()
      adapter.dispose()

      const reopened = connect([])
      await adapter.prepare()
      await adapter.subscribeEvents(() => {})
      expect(getSourceClock()).toBeNull()
      await statusListener(batch([status('stale', 2, 120000)]))
      expect(getSourceClock()).toBeNull()
      await reopened.listener('matcha.status')(batch([status('next', 3, 3000)]))
      expect(getSourceClock()).toMatchObject({
        sessionId: 'next',
        generation: 3,
        now: 3000,
      })
    } finally {
      adapter.dispose()
      vi.unstubAllGlobals()
    }
  })
  it('uses host replay time instead of wall time, including paused and completed casts', () => {
    const cast = {
      castId: 'cast',
      eventTime: 1000,
      receivedAt: 100,
      stoppedAt: null,
    }
    expect(displayClockTime(cast, 100, { source: 'replay', now: 2000 })).toBe(
      2000,
    )
    expect(
      displayClockTime(cast, 999999, { source: 'replay', now: 2000 }),
    ).toBe(2000)
    expect(
      displayClockTime(cast, 999999, { source: 'replay', now: 9000 }),
    ).toBe(9000)
    expect(displayClockTime(cast, 200)).toBe(1100)
    expect(
      displayClockTime({ ...cast, stoppedAt: 4000 }, 999999, {
        source: 'replay',
        now: 9000,
      }),
    ).toBe(4000)
  })
  it('uses snapshot sequence even when the latest event removed retained state', async () => {
    let receive!: BatchListener<Value>
    const snapshot = vi
      .fn()
      .mockResolvedValue({ events: [event(1)], sequence: 3 })
    const bridge = {
      subscribe: (_: string, listener: BatchListener<Value>) => {
        receive = listener
        return {
          ready: Promise.resolve(),
          dispose: vi.fn(),
          closed: new Promise(() => {}),
        }
      },
      snapshot,
    } as unknown as ViewBridge
    const seen: number[] = []
    await subscribeMojito(bridge, (item) => seen.push(item.sequence))
    await receive({
      subscriptionId: 'test',
      batchId: 1,
      firstSeq: 1,
      lastSeq: 1,
      initial: false,
      complete: true,
      items: [event(2), event(3), event(4)] as unknown as Value[],
    })
    expect(seen).toEqual([1, 4])
    expect(snapshot).toHaveBeenCalledOnce()
  })
})

it('notifies map consumers only when the client data generation changes', () => {
  updateSourceData({ mapDataGeneration: 0 })
  const listener = vi.fn(),
    stop = watchMapDataGeneration(listener)
  updateSourceData({ mapDataGeneration: 1 })
  updateSourceData({ mapDataGeneration: 1 })
  expect(getMapDataGeneration()).toBe(1)
  expect(listener).toHaveBeenCalledOnce()
  stop()
  updateSourceData({ mapDataGeneration: 0 })
})
