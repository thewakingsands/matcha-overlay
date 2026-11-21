/** The side of a map image in map units; one unit is one pixel at zoom 0 */
export const MAP_SIZE = 2048

/** [lat, lng]: lng grows to the right and lat grows upwards */
export type MapPoint = [lat: number, lng: number]

export interface Frame {
  width: number
  height: number
  /** Pixels on the right covered by a panel */
  insetRight: number
}

const PADDING_X = 36
const PADDING_Y = 48
/** A fit never zooms in past this, and a single point is shown at it */
const FOCUS_ZOOM = -1
/** How close to the edge of the visible part a point may sit and still count as shown */
const EDGE = 16

/** The zoom at which the map image just covers the frame */
export const coverZoom = (width: number, height: number) =>
  Math.log2(Math.max(width, height) / MAP_SIZE)

/** How far the view may go: the map image, and on the right as far as its edge reaching the left edge of the panel */
export const viewBounds = (
  insetRight: number,
  zoom: number,
): [MapPoint, MapPoint] => [
  [0, 0],
  [MAP_SIZE, MAP_SIZE + insetRight / 2 ** zoom],
]

/**
 * The view that shows the points in the part of the frame left of the panel, without leaving the map image. When
 * they do not all fit there, `primary` alone is shown; without any point it is the whole map, as far as it fits.
 */
export function frameView(
  points: MapPoint[],
  frame: Frame,
  primary?: MapPoint,
): { center: MapPoint; zoom: number } {
  const visible = frame.width - frame.insetRight
  const cover = coverZoom(frame.width, frame.height)
  const view = (targets: MapPoint[], closest = FOCUS_ZOOM) => {
    const lats = targets.map(([lat]) => lat)
    const lngs = targets.map(([, lng]) => lng)
    const south = Math.min(...lats)
    const north = Math.max(...lats)
    const west = Math.min(...lngs)
    const east = Math.max(...lngs)
    // Whole zoom levels, as Leaflet's fitBounds picks them.
    const fit = Math.floor(
      Math.log2(
        Math.min(
          Math.max(1, visible - 2 * PADDING_X) / (east - west),
          Math.max(1, frame.height - 2 * PADDING_Y) / (north - south),
        ),
      ),
    )
    const zoom = Math.max(cover, Math.min(closest, fit))
    const scale = 2 ** zoom
    const within = (value: number, low: number, high: number) =>
      Math.min(high, Math.max(low, value))
    const half = frame.width / 2 / scale
    const lng = within(
      (west + east) / 2 + frame.insetRight / 2 / scale,
      half,
      MAP_SIZE - half,
    )
    const center: MapPoint = [
      within(
        (south + north) / 2,
        frame.height / 2 / scale,
        MAP_SIZE - frame.height / 2 / scale,
      ),
      // The map moves past its right edge, under the panel, only as far as it takes to show the easternmost point.
      Math.min(
        MAP_SIZE - half + frame.insetRight / scale,
        Math.max(lng, east + half - (visible - EDGE) / scale),
      ),
    ]
    return { center, zoom }
  }
  if (!points.length) return view([[MAP_SIZE / 2, MAP_SIZE / 2]], cover)
  const all = view(points)
  if (!primary || points.length < 2) return all
  const [x, y] = framePosition(all, primary, frame)
  return x >= EDGE &&
    x <= visible - EDGE &&
    y >= EDGE &&
    y <= frame.height - EDGE
    ? all
    : view([primary])
}

/** Where a point of the map is in the frame, in pixels from its top left corner */
export function framePosition(
  view: { center: MapPoint; zoom: number },
  [lat, lng]: MapPoint,
  frame: Frame,
): [x: number, y: number] {
  const scale = 2 ** view.zoom
  return [
    frame.width / 2 + (lng - view.center[1]) * scale,
    frame.height / 2 - (lat - view.center[0]) * scale,
  ]
}
