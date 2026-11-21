export interface Marker {
  id?: string
  kind?: 'player' | 'observed' | 'history'
  icon?: MapIcon
  x: number
  y: number
  title?: string
  compact?: boolean
  /** The way the player faces, clockwise from north; the player is a plain dot without it */
  headingDegrees?: number | null
  /** An accent ring around an icon, to pick it out from the map's own markers */
  ring?: boolean
}

// https://xivapi.com/docs/Icons?set=icons060000
export enum MapIcon {
  Treasure = '060003', // 060354
  Aetheryte = '060453',
  Fate = '060093',
  Flag = '060561',
  MarkerA = '061241',
  MarkerB = '061242',
  MarkerC = '061243',
  MarkerD = '061244',
  Marker1 = '061245',
  Marker2 = '061246',
  Marker3 = '061247',
  Marker4 = '061248',
  Attack1 = '060687',
  Attack2 = '060688',
  Attack3 = '060689',
  Attack4 = '060690',
  Attack5 = '060691',
}
