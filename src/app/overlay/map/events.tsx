import { Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  EurekaEntry,
  HuntEntry,
  NavigationState,
} from '../../../adapter/exploration-types'
import {
  conditionWindow,
  direction,
  duration,
  heightDifference,
  observationAge,
} from '../exploration/format'
import { DirectionMarker } from './direction'
import { monsterName, type Scene, type Selection } from './model'

function Group({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="map-group">
      <h2 className="map-group-title">
        {title}
        {count !== undefined && <span>{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function Aetheryte({
  target,
}: {
  target: NonNullable<Scene['treasure']>['target']
}) {
  return target.aetheryte ? (
    <span className="map-event-line">
      最近的以太之光
      <br />
      <b>{target.aetheryte.name}</b> · {Math.round(target.aetheryte.distanceM)}{' '}
      m
    </span>
  ) : null
}

function Treasure({
  treasure: { target, here },
  navigation,
  name,
  selected,
  viewing,
  onSelect,
  onView,
}: {
  treasure: NonNullable<Scene['treasure']>
  navigation: NavigationState | null
  name: string
  selected: boolean
  viewing: boolean
  onSelect: () => void
  onView: (viewing: boolean) => void
}) {
  const title = (
    <span className="map-event-title">
      <span className="map-event-name">{name}</span>
    </span>
  )
  if (!here)
    return (
      <div className="map-event" data-selected={viewing || undefined}>
        {title}
        <span className="map-event-line">
          位于 <b>{target.placeName}</b>
        </span>
        <Aetheryte target={target} />
        <button
          type="button"
          className="map-event-action"
          aria-pressed={viewing}
          onClick={() => onView(!viewing)}
        >
          {viewing ? (
            <>
              <Undo2 />
              返回当前地图
            </>
          ) : (
            '查看位置'
          )}
        </button>
      </div>
    )
  const guidance = navigation?.guidance ?? null
  return (
    <button
      type="button"
      className="map-event"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {title}
      {guidance ? (
        <span className="map-event-line map-event-guidance">
          <DirectionMarker
            relative={guidance.relativeDegrees}
            near={guidance.near}
          />
          <span>
            {guidance.near
              ? '已接近'
              : `${direction(guidance.bearingDegrees)} · ${Math.round(guidance.distanceM)} m`}
            <span className="map-event-dim">
              {' '}
              · {heightDifference(guidance.heightDifferenceM)}
            </span>
          </span>
        </span>
      ) : (
        <span className="map-event-line">
          {navigation?.reason || '等待本人位置'}
        </span>
      )}
      <span className="map-event-line map-event-coordinates select-text">
        <span>X {target.x.toFixed(1)}</span>
        <span>Y {target.y.toFixed(1)}</span>
        <span>Z {target.z === null ? '—' : target.z.toFixed(1)}</span>
      </span>
      <Aetheryte target={target} />
    </button>
  )
}

function huntDetail(entry: HuntEntry, now: number | null) {
  if (entry.state === 'last-seen')
    return `最后观察 · ${observationAge(entry.lastObservedAt, now)}`
  if (entry.state === 'position-unknown') return '位置未知'
  return (
    [
      entry.distanceM === null ? null : `${Math.round(entry.distanceM)} m`,
      entry.hpPercent === null ? null : `HP ${Math.round(entry.hpPercent)}%`,
    ]
      .filter(Boolean)
      .join(' · ') || '当前观察'
  )
}

/** What the monster is doing, and whether that is happening now */
function monsterActivity(
  entry: EurekaEntry,
  now: number | null,
): { text: string; live: boolean } | null {
  if (entry.activity === 'active')
    return {
      live: true,
      text: `进行中${entry.progress === null ? '' : ` ${entry.progress}%`} · ${
        now === null || entry.activityEndsAt === null
          ? '剩余时间未知'
          : `剩余 ${duration(entry.activityEndsAt - now)}`
      }`,
    }
  if (entry.cooldown.readyAt !== null && now !== null)
    return {
      live: false,
      text:
        entry.cooldown.readyAt > now
          ? `估算冷却 · ${duration(entry.cooldown.readyAt - now)}`
          : '估算冷却已结束',
    }
  return entry.activity === 'unconfirmed'
    ? { live: false, text: '状态待确认' }
    : null
}

function monsterCondition(entry: EurekaEntry, now: number | null) {
  const what = [
    entry.conditions.weatherName,
    entry.conditions.nightOnly ? '夜晚' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return what
    ? `${what} · ${conditionWindow(entry.conditions.environmentWindow, now)}`
    : null
}

/** The event panel: what is worth knowing on the map the player is on */
export function Events({
  scene,
  navigation,
  treasureName,
  huntNow,
  eurekaNow,
  onSelect,
  onView,
}: {
  scene: Scene
  navigation: NavigationState | null
  treasureName: string
  /** Source time of the hunt and Eureka states, for ages and countdowns */
  huntNow: number | null
  eurekaNow: number | null
  onSelect: (selection: Selection) => void
  onView: (viewing: boolean) => void
}) {
  const { selection } = scene
  const chosen = (kind: 'hunt' | 'nm', id: number) =>
    selection.kind === kind && 'id' in selection && selection.id === id
  return (
    <>
      {scene.treasure && (
        <Group title="宝图">
          <Treasure
            treasure={scene.treasure}
            navigation={navigation}
            name={treasureName}
            selected={selection.kind === 'treasure'}
            viewing={scene.viewing}
            onSelect={() => onSelect({ kind: 'treasure' })}
            onView={onView}
          />
        </Group>
      )}
      {scene.hunts.length > 0 && (
        <Group title="狩猎" count={scene.hunts.length}>
          {scene.hunts.map((entry) => (
            <button
              key={entry.actorId}
              type="button"
              className="map-event"
              aria-pressed={chosen('hunt', entry.actorId)}
              onClick={() => onSelect({ kind: 'hunt', id: entry.actorId })}
            >
              <span className="map-event-title">
                {entry.rank && (
                  <span className="map-rank" data-rank={entry.rank}>
                    {entry.rank}
                  </span>
                )}
                <span className="map-event-name">{entry.name}</span>
              </span>
              <span className="map-event-line">
                {huntDetail(entry, huntNow)}
              </span>
            </button>
          ))}
        </Group>
      )}
      {scene.eureka && (
        <Group title="NM" count={scene.eureka.entries.length || undefined}>
          {scene.eureka.reason && (
            <p role="status" className="map-event-line map-group-status">
              {scene.eureka.reason}
            </p>
          )}
          {scene.eureka.entries.map((entry) => {
            const activity = monsterActivity(entry, eurekaNow)
            const condition = monsterCondition(entry, eurekaNow)
            return (
              <button
                key={entry.fateId}
                type="button"
                className="map-event"
                aria-pressed={chosen('nm', entry.fateId)}
                onClick={() => onSelect({ kind: 'nm', id: entry.fateId })}
              >
                <span className="map-event-title">
                  <span className="map-event-name" title={entry.name}>
                    {monsterName(entry.name)}
                  </span>
                </span>
                {activity && (
                  <span
                    className="map-event-line"
                    data-live={activity.live || undefined}
                  >
                    {activity.text}
                  </span>
                )}
                {condition && (
                  <span className="map-event-line">{condition}</span>
                )}
              </button>
            )
          })}
        </Group>
      )}
    </>
  )
}
