import { ArrowUp, CircleDot } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'

/** An arrow towards the target relative to the way the player faces; a dot once they are next to it */
export function DirectionMarker({
  relative,
  near,
}: {
  relative: number | null
  near: boolean
}) {
  const [angle, setAngle] = useState(relative ?? 0)
  useLayoutEffect(() => {
    if (relative !== null) {
      // Turn the short way round instead of spinning back through north.
      setAngle((previous) => {
        const turn = ((((relative - previous + 180) % 360) + 360) % 360) - 180
        return previous + turn
      })
    }
  }, [relative])
  return (
    <span className="map-direction" aria-hidden="true">
      <ArrowUp
        className={relative === null ? 'map-direction-hidden' : undefined}
        style={{ transform: `rotate(${angle}deg)` }}
      />
      <CircleDot className={near ? undefined : 'map-direction-hidden'} />
    </span>
  )
}
