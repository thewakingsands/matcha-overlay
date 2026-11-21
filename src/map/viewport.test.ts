import { expect, it } from 'vitest'
import {
  coverZoom,
  type Frame,
  framePosition,
  frameView,
  type MapPoint,
  viewBounds,
} from './viewport'

// The default overlay: 440 px wide with a 167 px event panel and its 16 px of margin.
const frame: Frame = { width: 440, height: 358, insetRight: 183 }
const visible = frame.width - frame.insetRight
// Eureka Pyros, from the client: 彭忒西勒亚 is near the right edge of the map, 埃托洛斯 on its left half.
const penthesilea: MapPoint = [1800.8, 1746.8]
const aetolus: MapPoint = [1387.9, 457]

it('centres a point in the part of the frame left of the panel', () => {
  const point: MapPoint = [1024, 1024]
  const view = frameView([point], frame)
  expect(view.zoom).toBe(-1)
  expect(framePosition(view, point, frame)).toEqual([visible / 2, 179])
  // Without a panel it is the middle of the frame.
  const whole = { ...frame, insetRight: 0 }
  expect(framePosition(frameView([point], whole), point, whole)[0]).toBe(220)
})

it('keeps a target near the right edge of the map left of the panel', () => {
  for (const point of [penthesilea, [1024, 2040] as MapPoint]) {
    const view = frameView([point], frame)
    const [x] = framePosition(view, point, frame)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(visible)
    // The map is not moved past its own edge to get there, except under the panel.
    const scale = 2 ** view.zoom
    const [, [, east]] = viewBounds(frame.insetRight, view.zoom)
    expect(view.center[1] + frame.width / 2 / scale).toBeLessThanOrEqual(east)
    expect(view.center[0] + frame.height / 2 / scale).toBeLessThanOrEqual(2048)
  }
})

it('shows the chosen target alone when it and the player do not fit left of the panel', () => {
  const view = frameView([penthesilea, aetolus], frame, penthesilea)
  const [x, y] = framePosition(view, penthesilea, frame)
  expect(x).toBeGreaterThanOrEqual(0)
  expect(x).toBeLessThanOrEqual(visible)
  expect(y).toBeGreaterThanOrEqual(0)
  expect(y).toBeLessThanOrEqual(frame.height)
  // Two points that fit are both shown.
  const near: MapPoint = [1700, 1600]
  const both = frameView([penthesilea, near], frame, penthesilea)
  for (const point of [penthesilea, near]) {
    const [bothX] = framePosition(both, point, frame)
    expect(bothX).toBeGreaterThan(0)
    expect(bothX).toBeLessThan(visible)
  }
})

it('never zooms out past the map covering the frame, whatever the frame was before', () => {
  expect(2048 * 2 ** coverZoom(440, 358)).toBeCloseTo(440)
  expect(2048 * 2 ** coverZoom(900, 260)).toBeCloseTo(900)
  const far = frameView(
    [
      [100, 100],
      [1900, 1900],
    ] as MapPoint[],
    frame,
  )
  expect(far.zoom).toBe(coverZoom(440, 358))
  expect(
    frameView([[1024, 1024]], { width: 1400, height: 1200, insetRight: 0 })
      .zoom,
  ).toBe(coverZoom(1400, 1200))
})

it('shows the whole map from its left edge when there is nothing to centre on', () => {
  const view = frameView([], frame)
  expect(view.zoom).toBe(coverZoom(440, 358))
  expect(framePosition(view, [1024, 0], frame)[0]).toBeCloseTo(0)
})

it('goes past the right edge of the map only as far as the target needs', () => {
  // A target in the middle of the right half: centred as far as the map reaches, without leaving its edge.
  const inside = frameView([[1024, 1500]], frame)
  expect(framePosition(inside, [1024, 2048], frame)[0]).toBeCloseTo(440)
  expect(framePosition(inside, [1024, 1500], frame)[0]).toBeLessThan(visible)
  // A target at the edge: the map moves under the panel, at most until its own edge reaches the panel's.
  const edge = frameView([[1024, 2040]], frame)
  expect(framePosition(edge, [1024, 2048], frame)[0]).toBeCloseTo(visible)
  expect(framePosition(edge, [1024, 2040], frame)[0]).toBeCloseTo(visible - 4)
})
