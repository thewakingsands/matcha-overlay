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
  const handlers: Record<string, (() => void)[]> = {}
  const listen = (names: string, handler: () => void) => {
    for (const name of names.split(' ')) {
      handlers[name] ??= []
      handlers[name].push(handler)
    }
  }
  const map = {
    loadMapKey: vi.fn(),
    mapInfo: {},
    addMarker: vi.fn(),
    mapToLatLng2D: (x: number, y: number) => [y, x],
    options: {} as Record<string, unknown>,
    zoom: -1,
    getSize: () => size,
    getZoom: () => map.zoom,
    getContainer: () => ({ addEventListener: listen }),
    setMinZoom: vi.fn((zoom: number) => {
      map.options.minZoom = zoom
    }),
    setMaxBounds: vi.fn(),
    panInsideBounds: vi.fn(),
    on: vi.fn(listen),
    setView: vi.fn((_: unknown, zoom: number) => {
      map.zoom = zoom
    }),
    fitBounds: vi.fn(),
  }
  const library = { L: { latLngBounds: (bounds: unknown) => bounds } }
  return {
    map,
    library,
    fire: (name: string) => {
      for (const handler of handlers[name] ?? []) handler()
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
  const show = () =>
    displayMap(map as unknown as EoMap, value, library as never, title)
  await show()
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
  // The same update again neither moves the map nor sets its limits again.
  const limits = map.setMaxBounds.mock.calls.length
  await show()
  expect(map.setView).toHaveBeenCalledTimes(1)
  expect(map.setMinZoom).toHaveBeenCalledTimes(1)
  expect(map.setMaxBounds).toHaveBeenCalledTimes(limits)

  size.x = 900
  fire('resize')
  expect(map.setMinZoom).toHaveBeenLastCalledWith(Math.log2(900 / 2048))
  size.x = 440
  fire('resize')
  expect(map.setMinZoom).toHaveBeenLastCalledWith(initial)
})

it('gives a map that missed its limits once the limits with the next update', async () => {
  // The frame has no size when the map is first shown.
  const size = { x: 0, y: 0 }
  const { map, library } = coveringMap(size)
  const title = { textContent: '', hidden: false } as HTMLElement
  const value = {
    map: 1,
    focus: { key: 'a', points: [] },
    viewport: { cover: true as const, insetRight: 0 },
  }
  const show = () =>
    displayMap(map as unknown as EoMap, value, library as never, title)
  await show()
  expect(map.setMinZoom).not.toHaveBeenCalled()
  expect(map.setView).not.toHaveBeenCalled()
  size.x = 440
  size.y = 358
  await show()
  expect(map.setMinZoom).toHaveBeenLastCalledWith(Math.log2(440 / 2048))
  expect(map.setView).toHaveBeenCalledTimes(1)
})

it('focuses again when the frame changes size, unless the user has moved the map', async () => {
  const size = { x: 440, y: 358 }
  const { map, library, fire } = coveringMap(size)
  const title = { textContent: '', hidden: false } as HTMLElement
  const show = (key: string) =>
    displayMap(
      map as unknown as EoMap,
      {
        map: 1,
        focus: { key, points: [{ x: 1024, y: 1024 }] },
        viewport: { cover: true as const, insetRight: 183 },
      },
      library as never,
      title,
    )
  await show('first')
  size.x = 640
  await show('first')
  expect(map.setView).toHaveBeenCalledTimes(2)
  for (const event of ['dragstart', 'wheel']) {
    const views = map.setView.mock.calls.length
    fire(event)
    size.x += 10
    await show(views === 2 ? 'first' : 'dragstart')
    expect(map.setView).toHaveBeenCalledTimes(views)
    // A new focus is always followed, and the frame is watched again after it.
    await show(event)
    expect(map.setView).toHaveBeenCalledTimes(views + 1)
    size.x += 10
    await show(event)
    expect(map.setView).toHaveBeenCalledTimes(views + 2)
  }
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
