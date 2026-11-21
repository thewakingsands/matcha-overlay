import { lazy, Suspense } from 'react'
import type { Marker } from '../../map/interface'

const EmbeddedMap = lazy(() => import('./embedded'))

export interface MapInfo {
  map: number
  markers?: Marker[]
  line?: { x: number; y: number }[]
  focus?: {
    key: string
    points: { x: number; y: number }[]
    /** The point that has to stay visible when the points do not all fit */
    primary?: { x: number; y: number }
  }
  /**
   * The map always covers its frame, cannot be dragged off its image, and is focused in the part of the frame left
   * of a panel `insetRight` pixels wide; the frame draws its own place name. Without it the map behaves as before.
   */
  viewport?: { cover: true; insetRight: number }
}

export function EorzeaMap(value: MapInfo) {
  return (
    <Suspense fallback={null}>
      <EmbeddedMap {...value} />
    </Suspense>
  )
}
