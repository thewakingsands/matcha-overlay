import { useMemo, useState, useSyncExternalStore } from 'react'
import { Empty } from '#components/ui/controls'
import {
  getExplorationState,
  subscribeExploration,
} from '../../../adapter/exploration'
import type { EurekaEntry, HuntEntry } from '../../../adapter/exploration-types'
import { EorzeaMap, type MapInfo } from '../../../components/map'
import { MapIcon } from '../../../map/interface'
import type { OverlayProps } from '../../interface'
import {
  conditionWindow,
  eurekaActivity,
  heightDifference,
  observationAge,
  sortEureka,
  sortHunts,
  sourceTime,
} from './format'
import './index.css'

export function HuntOverlay({ active }: OverlayProps) {
  const { hunts } = useSyncExternalStore(
    subscribeExploration,
    getExplorationState,
  )
  const [selection, setSelection] = useState({ id: 0, revision: 0 })
  const entries = useMemo(
    () => sortHunts(hunts?.entries ?? []),
    [hunts?.entries],
  )
  const current = entries.filter(
    (entry) => entry.state === 'observed' || entry.state === 'position-unknown',
  )
  const history = entries.filter(
    (entry) => entry.state === 'last-seen' || entry.state === 'ended',
  )
  const chosen = entries.find((entry) => entry.actorId === selection.id)
  const map = useMemo<MapInfo | null>(
    () =>
      hunts?.mapId
        ? {
            map: hunts.mapId,
            markers: entries.flatMap((entry) =>
              entry.position?.mapId === hunts.mapId && entry.state !== 'ended'
                ? [
                    {
                      id: String(entry.actorId),
                      kind:
                        entry.state === 'observed'
                          ? ('observed' as const)
                          : ('history' as const),
                      x: entry.position.x,
                      y: entry.position.y,
                      title: entry.name,
                    },
                  ]
                : [],
            ),
            focus: {
              key: `${hunts.context.zoneEpoch}:${selection.id}:${selection.revision}`,
              points:
                chosen?.position?.mapId === hunts.mapId
                  ? [chosen.position]
                  : entries.flatMap((entry) =>
                      entry.position?.mapId === hunts.mapId &&
                      entry.state !== 'ended'
                        ? [entry.position]
                        : [],
                    ),
            },
          }
        : null,
    [hunts, entries, chosen, selection],
  )
  if (!active) return null
  const row = (entry: HuntEntry) => (
    <button
      key={entry.actorId}
      type="button"
      className="exploration-row hunt-row"
      aria-pressed={selection.id === entry.actorId}
      onClick={() =>
        setSelection(({ revision }) => ({
          id: entry.actorId,
          revision: revision + 1,
        }))
      }
    >
      <span className="exploration-row-title">
        <span
          className={`hunt-symbol hunt-symbol-${entry.state}`}
          aria-hidden="true"
        />
        {entry.name}
        <span className="exploration-rank">{entry.rank ?? '等级未知'}</span>
      </span>
      <span className="exploration-row-detail">
        {entry.state === 'observed'
          ? '当前观察'
          : entry.state === 'last-seen'
            ? '最后观察'
            : entry.state === 'ended'
              ? '已结束'
              : '位置未知'}
        {entry.state === 'observed' ? (
          <>
            {entry.distanceM === null
              ? ''
              : ` · ${Math.round(entry.distanceM)} m`}
            {entry.hpPercent === null
              ? ''
              : ` · HP ${Math.round(entry.hpPercent)}%`}
          </>
        ) : (
          ` · ${observationAge(entry.lastObservedAt, sourceTime(hunts?.context.clock))}`
        )}
      </span>
      {entry.state === 'observed' && entry.distanceM !== null && (
        <span className="exploration-row-detail">
          {heightDifference(entry.heightDifferenceM)}
        </span>
      )}
      {entry.position && (
        <span className="exploration-coordinates">
          X {entry.position.x.toFixed(1)} · Y {entry.position.y.toFixed(1)}
        </span>
      )}
    </button>
  )
  return (
    <section className="overlay overlay-exploration" aria-label="狩猎观察">
      {map && (
        <div className="exploration-map">
          <EorzeaMap {...map} />
        </div>
      )}
      <div className="exploration-list">
        {(hunts?.status !== 'ready' || hunts.reason) && (
          <p role="status" className="exploration-status">
            {hunts?.reason || '等待狩猎资料'}
          </p>
        )}
        {current.map(row)}
        {history.length > 0 && (
          <details className="exploration-history">
            <summary>历史位置 · {history.length}</summary>
            {history.map(row)}
          </details>
        )}
        {hunts?.status === 'ready' && !entries.length && (
          <Empty>当前区域尚未观察到狩猎目标</Empty>
        )}
      </div>
    </section>
  )
}

export function EurekaOverlay({ active }: OverlayProps) {
  const { eureka } = useSyncExternalStore(
    subscribeExploration,
    getExplorationState,
  )
  const [selection, setSelection] = useState({ id: 0, revision: 0 })
  const now = sourceTime(eureka?.context.clock)
  const entries = useMemo(
    () => sortEureka(eureka?.entries ?? [], now),
    [eureka?.entries, now],
  )
  const chosen = entries.find((entry) => entry.fateId === selection.id)
  const map = useMemo<MapInfo | null>(
    () =>
      eureka?.mapId
        ? {
            map: eureka.mapId,
            markers: entries.flatMap((entry) =>
              entry.position?.mapId === eureka.mapId
                ? [
                    {
                      id: String(entry.fateId),
                      icon: MapIcon.Fate,
                      x: entry.position.x,
                      y: entry.position.y,
                      title: entry.name,
                    },
                  ]
                : [],
            ),
            focus: {
              key: `${eureka.context.zoneEpoch}:${selection.id}:${selection.revision}`,
              points:
                chosen?.position?.mapId === eureka.mapId
                  ? [chosen.position]
                  : entries.flatMap((entry) =>
                      entry.position?.mapId === eureka.mapId
                        ? [entry.position]
                        : [],
                    ),
            },
          }
        : null,
    [eureka, entries, chosen, selection],
  )
  if (!active) return null
  const row = (entry: EurekaEntry) => (
    <button
      key={entry.fateId}
      type="button"
      className="exploration-row eureka-row"
      aria-pressed={selection.id === entry.fateId}
      onClick={() =>
        setSelection(({ revision }) => ({
          id: entry.fateId,
          revision: revision + 1,
        }))
      }
    >
      <span className="exploration-row-title">{entry.name}</span>
      <span className="exploration-row-detail">
        {eurekaActivity(entry, now)}
        {entry.cooldown.basis === 'first-observed' ? ' · 从首次观察估算' : ''}
      </span>
      {entry.activity !== 'active' && entry.activity !== 'unknown' && (
        <span className="exploration-row-detail">
          {entry.activity === 'ended' ? '已结束' : '状态待确认'}
        </span>
      )}
      <span className="exploration-row-detail">
        {[
          entry.conditions.weatherName,
          entry.conditions.nightOnly ? '夜晚' : null,
        ]
          .filter(Boolean)
          .join(' · ') || '环境条件'}{' '}
        · {conditionWindow(entry.conditions.environmentWindow, now)}
      </span>
      {entry.conditions.estimatedWindow && (
        <span className="exploration-row-detail">
          推测条件窗口 ·{' '}
          {conditionWindow(entry.conditions.estimatedWindow, now)}
        </span>
      )}
      {entry.conditions.otherConditionsUnknown && (
        <span className="exploration-row-detail">其他条件未知</span>
      )}
    </button>
  )
  return (
    <section
      className="overlay overlay-exploration"
      aria-label="优雷卡 NM 计时"
    >
      {map && (
        <div className="exploration-map">
          <EorzeaMap {...map} />
          <span className="exploration-map-caption">静态事件地点</span>
        </div>
      )}
      <div className="exploration-list">
        {(eureka?.status !== 'ready' || eureka.reason) && (
          <p role="status" className="exploration-status">
            {eureka?.reason ||
              (eureka?.status === 'outside'
                ? '进入优雷卡后显示本岛 NM'
                : '等待优雷卡资料')}
          </p>
        )}
        {entries.map(row)}
        {eureka?.status === 'ready' && !entries.length && (
          <Empty>本岛 NM 资料不可用</Empty>
        )}
      </div>
    </section>
  )
}
