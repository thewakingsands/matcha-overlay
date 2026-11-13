import type { ClockState } from '@ffcafe/mojito-plugin-sdk'
import type {
  EurekaEntry,
  HuntEntry,
  TimeWindow,
} from '../../../adapter/exploration-types'

export function direction(degrees: number | null) {
  return degrees === null
    ? ''
    : ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][
        Math.round((((degrees % 360) + 360) % 360) / 45) % 8
      ]
}
export function heightDifference(value: number | null) {
  if (value === null) return '高度差未知'
  const meters = Math.round(Math.abs(value))
  return meters === 0
    ? '高度差 0 m'
    : `${value > 0 ? '高于你' : '低于你'} ${meters} m`
}
export function duration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
export function observationAge(at: number | null, now: number | null) {
  return at === null || now === null ? '时间未知' : `${duration(now - at)} 前`
}
export function sortHunts(entries: HuntEntry[]) {
  return [...entries].sort(
    (a, b) =>
      Number(b.state === 'observed') - Number(a.state === 'observed') ||
      (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) ||
      a.actorId - b.actorId,
  )
}
function eurekaOrder(entry: EurekaEntry, now: number | null) {
  if (entry.activity === 'active') return 0
  if (
    now !== null &&
    entry.conditions.estimatedWindow &&
    entry.conditions.estimatedWindow.opensAt <= now &&
    (entry.conditions.estimatedWindow.closesAt === null ||
      entry.conditions.estimatedWindow.closesAt > now)
  )
    return 1
  if (entry.cooldown.readyAt !== null || entry.conditions.status === 'waiting')
    return 2
  return 3
}
function eurekaDeadline(entry: EurekaEntry, now: number | null) {
  if (entry.activity === 'active') return entry.activityEndsAt ?? Infinity
  if (eurekaOrder(entry, now) === 1)
    return entry.conditions.estimatedWindow?.closesAt ?? Infinity
  return (
    entry.conditions.estimatedWindow?.opensAt ??
    entry.cooldown.readyAt ??
    entry.conditions.environmentWindow?.opensAt ??
    Infinity
  )
}
export function sortEureka(entries: EurekaEntry[], now: number | null) {
  return [...entries].sort(
    (a, b) =>
      eurekaOrder(a, now) - eurekaOrder(b, now) ||
      eurekaDeadline(a, now) - eurekaDeadline(b, now) ||
      a.fateId - b.fateId,
  )
}
export function eurekaActivity(entry: EurekaEntry, now: number | null) {
  if (entry.activity === 'active')
    return `进行中${entry.progress === null ? '' : ` ${entry.progress}%`} · ${now === null || entry.activityEndsAt === null ? '剩余时间未知' : duration(entry.activityEndsAt - now)}`
  if (entry.activity === 'unconfirmed') return '状态待确认'
  if (entry.cooldown.readyAt !== null && now !== null)
    return `估算冷却 ${entry.cooldown.readyAt > now ? duration(entry.cooldown.readyAt - now) : '已过'}`
  return entry.activity === 'ended' ? '已结束 · 时间未知' : '尚未观察'
}
export function conditionWindow(window: TimeWindow | null, now: number | null) {
  if (window === null || now === null) return '未知'
  if (window.opensAt > now) return `${duration(window.opensAt - now)} 后`
  return window.closesAt === null
    ? '当前满足'
    : `${duration(window.closesAt - now)} 内`
}

export function sourceTime(clock: ClockState | undefined) {
  return clock?.source &&
    clock.base &&
    clock.now !== null &&
    Number.isFinite(clock.now)
    ? clock.now
    : null
}
