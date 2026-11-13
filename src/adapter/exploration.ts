import type {
  EurekaState,
  ExplorationContext,
  ExplorationStates,
  HuntState,
  NavigationState,
} from './exploration-types'

const empty = (): ExplorationStates => ({
  navigation: null,
  hunts: null,
  eureka: null,
})
let state = empty()
let context: ExplorationContext | null = null
const listeners = new Set<() => void>()
const generations = [
  'characterGeneration',
  'clockGeneration',
  'zoneEpoch',
  'catalogRevision',
] as const
export const getExplorationState = () => state
export function subscribeExploration(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function publish(next: ExplorationStates) {
  state = next
  for (const listener of listeners) listener()
}
export function clearExploration() {
  context = null
  if (state.navigation || state.hunts || state.eureka) publish(empty())
}
export function receiveExploration(type: string, value: unknown) {
  if (type === 'Reset') {
    clearExploration()
    return
  }
  const key =
    type === 'NavigationState'
      ? 'navigation'
      : type === 'HuntState'
        ? 'hunts'
        : type === 'EurekaState'
          ? 'eureka'
          : null
  if (!key || !value || typeof value !== 'object' || !('context' in value))
    return
  const next = value as NavigationState | HuntState | EurekaState
  if (
    typeof next.status !== 'string' ||
    (key !== 'navigation' &&
      !('entries' in next && Array.isArray(next.entries)))
  )
    return
  const incoming = next.context
  if (
    !incoming?.clock ||
    !generations.every(
      (key) => Number.isSafeInteger(incoming[key]) && incoming[key] >= 0,
    )
  )
    return
  const previous = context
  if (
    previous?.sessionId === incoming.sessionId &&
    generations.some((key) => incoming[key] < previous[key])
  )
    return
  const changed =
    previous &&
    (previous.sessionId !== incoming.sessionId ||
      previous.territoryId !== incoming.territoryId ||
      generations.some((key) => previous[key] !== incoming[key]))
  context = incoming
  publish({ ...(changed ? empty() : state), [key]: next })
}
