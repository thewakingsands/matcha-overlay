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
