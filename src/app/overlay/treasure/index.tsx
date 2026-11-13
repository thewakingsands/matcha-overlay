import { ArrowUp, LocateFixed } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { IconButton } from '#components/ui/button'
import { Empty } from '#components/ui/controls'
import { adapter } from '../../../adapter'
import {
  getExplorationState,
  subscribeExploration,
} from '../../../adapter/exploration'
import { EorzeaMap, type MapInfo } from '../../../components/map'
import { Maps } from '../../../data/maps'
import { MapIcon } from '../../../map/interface'
import type { OverlayProps } from '../../interface'
import { direction, heightDifference } from '../exploration/format'
import { useTreasureSpot } from './data-source/treasure'
import './index.css'

export function TreasureOverlay({
  eventEmitter,
  active,
  setActive,
}: OverlayProps) {
  const legacyPoint = useTreasureSpot(eventEmitter)
  const { navigation } = useSyncExternalStore(
    subscribeExploration,
    getExplorationState,
  )
  const nav = adapter.name === 'Mojito' ? navigation : null
  const target = nav?.target
  const point = useMemo(
    () =>
      target
        ? { map: target.mapId, x: target.x, y: target.y }
        : nav
          ? null
          : legacyPoint,
    [target, legacyPoint, nav],
  )
  const [center, setCenter] = useState(0)
  const targetKey = target
    ? `${target.itemId}:${target.spotIndex}`
    : (legacyPoint?.identity ?? '')
  const mapInfo = useMemo<MapInfo | null>(
    () =>
      point
        ? {
            map: point.map,
            markers: [
              { id: 'target', icon: MapIcon.Treasure, x: point.x, y: point.y },
              ...(nav?.player
                ? [
                    {
                      id: 'player',
                      kind: 'player' as const,
                      x: nav.player.x,
                      y: nav.player.y,
                      title: '本人',
                    },
                  ]
                : []),
            ],
            line: nav?.player ? [point, nav.player] : undefined,
            focus: {
              key: `${targetKey}:${center}`,
              points: nav?.player ? [point, nav.player] : [point],
            },
          }
        : null,
    [point, nav?.player, targetKey, center],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only a newly selected target brings the panel forward.
  useEffect(() => {
    if (targetKey && !active) setActive()
  }, [targetKey])
  if (!active) return null
  if (!point || !mapInfo)
    return (
      <div className="overlay">
        <Empty>{nav?.reason || '未检测到宝图，请尝试切换地图'}</Empty>
      </div>
    )
  return (
    <div className="overlay overlay-treasure">
      <div className="treasure-map">
        <EorzeaMap {...mapInfo} />
      </div>
      <div
        className={`treasure-card${adapter.name === 'Mojito' ? ' treasure-card-navigation' : ''}`}
      >
        <div className="treasure-summary">
          <span className="treasure-place">
            {target?.placeName || Maps[point.map]?.name}
          </span>
          <span className="treasure-position select-text">
            X <b>{point.x.toFixed(1)}</b> Y <b>{point.y.toFixed(1)}</b>
            {adapter.name === 'Mojito' && (
              <>
                {' '}
                Z{' '}
                <b>
                  {target?.z === null || target?.z === undefined
                    ? '—'
                    : target.z.toFixed(2)}
                </b>
              </>
            )}
          </span>
        </div>
        {target?.zStatus === 'unavailable' && (
          <span className="treasure-data-note">高度资料不可用</span>
        )}
        {adapter.name === 'Mojito' && (
          <div className="treasure-navigation">
            <span className="treasure-guidance">
              {nav?.guidance ? (
                <>
                  {nav.guidance.relativeDegrees !== null && (
                    <ArrowUp
                      aria-label="相对本人朝向"
                      style={{
                        transform: `rotate(${nav.guidance.relativeDegrees}deg)`,
                      }}
                    />
                  )}
                  <span>
                    {nav.guidance.near
                      ? '已接近'
                      : `${direction(nav.guidance.bearingDegrees)} · ${Math.round(nav.guidance.distanceM)} m`}
                    <span className="treasure-height">
                      {heightDifference(nav.guidance.heightDifferenceM)}
                    </span>
                  </span>
                </>
              ) : (
                nav?.reason || '等待本人位置'
              )}
            </span>
            <IconButton
              label="重新居中"
              onClick={() => setCenter((value) => value + 1)}
            >
              <LocateFixed />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  )
}
