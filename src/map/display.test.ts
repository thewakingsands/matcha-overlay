import type { EoMap } from '@thewakingsands/eorzea-interactive-map'
import { expect, it, vi } from 'vitest'

import { displayMap } from './display'
import { MapIcon } from './interface'

it('moves stable markers without reloading or recentering, then removes obsolete markers', async () => {
  const layer = { setLatLng: vi.fn(), remove: vi.fn(), unbindTooltip: vi.fn() }
  const library = {
    loader: { getIconUrl: () => 'data:image/png;base64,AA==' },
    simpleMarker: vi.fn(() => layer),
  }
  const map = {
    loadMapKey: vi.fn(),
    mapInfo: { placeName: 'Synthetic map' },
    addMarker: vi.fn(),
    mapToLatLng2D: (x: number, y: number) => [x, y],
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }
  const title = { textContent: '' } as HTMLElement
  const first = {
    map: 1,
    markers: [{ id: 'target', icon: MapIcon.Treasure, x: 10, y: 10 }],
    focus: { key: 'target', points: [{ x: 10, y: 10 }] },
  }
  await displayMap(map as unknown as EoMap, first, library as never, title)
  await displayMap(
    map as unknown as EoMap,
    { ...first, markers: [{ ...first.markers[0], x: 11 }] },
    library as never,
    title,
  )
  expect(map.loadMapKey).toHaveBeenCalledTimes(1)
  expect(map.setView).toHaveBeenCalledTimes(1)
  expect(library.simpleMarker).toHaveBeenCalledTimes(1)
  expect(layer.setLatLng).toHaveBeenLastCalledWith([11, 10])
  await displayMap(
    map as unknown as EoMap,
    { ...first, markers: [], focus: { key: 'empty', points: [] } },
    library as never,
    title,
  )
  expect(layer.remove).toHaveBeenCalledTimes(1)
})

it('recenters only when explicitly requested or an old unkeyed target changes', async () => {
  const layer = { setLatLng: vi.fn(), remove: vi.fn(), unbindTooltip: vi.fn() }
  const library = {
    loader: { getIconUrl: () => 'data:image/png;base64,AA==' },
    simpleMarker: () => layer,
  }
  const map = {
    loadMapKey: vi.fn(),
    mapInfo: {},
    addMarker: vi.fn(),
    mapToLatLng2D: (x: number, y: number) => [x, y],
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }
  const title = { textContent: '' } as HTMLElement
  const value = { map: 1, markers: [{ icon: MapIcon.Treasure, x: 10, y: 10 }] }
  await displayMap(map as unknown as EoMap, value, library as never, title)
  await displayMap(
    map as unknown as EoMap,
    { ...value, markers: [{ ...value.markers[0], x: 12 }] },
    library as never,
    title,
  )
  expect(map.setView).toHaveBeenCalledTimes(2)
  await displayMap(
    map as unknown as EoMap,
    {
      ...value,
      focus: {
        key: 'recenter',
        points: [
          { x: 10, y: 10 },
          { x: 12, y: 12 },
        ],
      },
    },
    library as never,
    title,
  )
  expect(map.fitBounds).toHaveBeenCalledTimes(1)
})

function coveringMap(size: { x: number; y: number }) {
  const handlers: (() => void)[] = []
  const map = {
    loadMapKey: vi.fn(),
    mapInfo: {},
    addMarker: vi.fn(),
    mapToLatLng2D: (x: number, y: number) => [y, x],
    options: {} as Record<string, unknown>,
    zoom: -1,
    getSize: () => size,
    getZoom: () => map.zoom,
    setMinZoom: vi.fn(),
    setMaxBounds: vi.fn(),
    panInsideBounds: vi.fn(),
    on: vi.fn((_: string, handler: () => void) => handlers.push(handler)),
    setView: vi.fn((_: unknown, zoom: number) => {
      map.zoom = zoom
    }),
    fitBounds: vi.fn(),
  }
  const library = { L: { latLngBounds: (bounds: unknown) => bounds } }
  return {
    map,
    library,
    fire: () => {
      for (const handler of handlers) handler()
    },
  }
}

it('covers the frame: zooms out only until the map fills it, also after the frame grew and shrank again', async () => {
  const size = { x: 440, y: 358 }
  const { map, library, fire } = coveringMap(size)
  const title = { textContent: '', hidden: false } as HTMLElement
  const value = {
    map: 1,
    focus: { key: 'a', points: [{ x: 1024, y: 1024 }] },
    viewport: { cover: true as const, insetRight: 183 },
  }
  await displayMap(map as unknown as EoMap, value, library as never, title)
  const initial = Math.log2(440 / 2048)
  expect(map.setMinZoom).toHaveBeenLastCalledWith(initial)
  expect(map.options.maxBoundsViscosity).toBe(1)
  expect(title.hidden).toBe(true)
  // At zoom -1 the 183 px of the panel are 366 map units: the map's right edge may reach the panel's left edge.
  expect(map.setMaxBounds).toHaveBeenLastCalledWith([
    [0, 0],
    [2048, 2048 + 366],
  ])
  // Focused left of the panel, with the bounds of the zoom it moves to.
  expect(map.setView).toHaveBeenLastCalledWith([1024, 1024 + 183], -1, {
    animate: false,
  })
  expect(map.options.maxBounds).toEqual([
    [0, 0],
    [2048, 2048 + 366],
  ])
  size.x = 900
  fire()
  expect(map.setMinZoom).toHaveBeenLastCalledWith(Math.log2(900 / 2048))
  size.x = 440
  fire()
  expect(map.setMinZoom).toHaveBeenLastCalledWith(initial)
  // The same update again neither moves the map nor computes the bounds again.
  const calls = map.setMaxBounds.mock.calls.length
  await displayMap(map as unknown as EoMap, value, library as never, title)
  expect(map.setView).toHaveBeenCalledTimes(1)
  expect(map.setMaxBounds).toHaveBeenCalledTimes(calls)
})

it('leaves the drag range and the zoom limits alone without a viewport', async () => {
  const { map, library } = coveringMap({ x: 440, y: 358 })
  const title = { textContent: '', hidden: false } as HTMLElement
  await displayMap(
    map as unknown as EoMap,
    { map: 1, focus: { key: 'a', points: [{ x: 1024, y: 1024 }] } },
    library as never,
    title,
  )
  expect(map.setMinZoom).not.toHaveBeenCalled()
  expect(map.setMaxBounds).not.toHaveBeenCalled()
  expect(map.on).not.toHaveBeenCalled()
  expect(map.options).toEqual({})
  expect(title.hidden).toBe(false)
  expect(map.setView).toHaveBeenLastCalledWith([1024, 1024], -1, {
    animate: false,
  })
})
