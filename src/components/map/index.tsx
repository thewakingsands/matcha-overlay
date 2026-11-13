import { lazy, Suspense } from 'react'
import type { Marker } from '../../map/interface'

const EmbeddedMap = lazy(() => import('./embedded'))

export interface MapInfo {
  map: number
  markers?: Marker[]
  line?: { x: number; y: number }[]
  focus?: { key: string; points: { x: number; y: number }[] }
}

export function EorzeaMap(value: MapInfo) {
  return (
    <Suspense fallback={null}>
      <EmbeddedMap {...value} />
    </Suspense>
  )
}
