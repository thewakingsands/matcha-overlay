import type { MapInfo } from '../../../components/map'

export interface PointInfo {
  identity: string
  map: number
  x: number
  y: number
}

export type MapAction = (info: MapInfo) => void
