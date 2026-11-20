import { useEffect, useState, useSyncExternalStore } from 'react'
import { adapter } from '../../../../adapter'
import { queryMateriaAtlas } from '../../../../adapter/mojito'

export type MateriaAtlas = { image: HTMLImageElement; scale: 1 | 2 }

export function useMateriaAtlas(active: boolean) {
  const { mapGeneration } = useSyncExternalStore(
    adapter.subscribeState,
    adapter.getState,
  )
  const [loaded, setLoaded] = useState<
    (MateriaAtlas & { generation: number }) | null
  >(null)

  useEffect(() => {
    setLoaded(null)
    if (!active || adapter.name !== 'Mojito') return
    let current = true
    async function load() {
      const source = await queryMateriaAtlas()
      if (!current || !source) return
      const image = new Image()
      image.src = source.url
      await image.decode()
      if (
        current &&
        image.naturalWidth === 256 * source.scale &&
        image.naturalHeight === 96 * source.scale
      )
        setLoaded({ image, scale: source.scale, generation: mapGeneration })
    }
    void load().catch(() => {
      if (current) setLoaded(null)
    })
    return () => {
      current = false
    }
  }, [active, mapGeneration])

  return active && loaded?.generation === mapGeneration ? loaded : null
}

// Verified against global client 7.58. Coordinates use 24px cells; overmelds are one row below.
const tierOrigins = [
  [96, 12],
  [72, 12],
  [48, 12],
  [24, 12],
  [156, 0],
  [156, 48],
  [180, 0],
  [180, 48],
  [204, 0],
  [204, 48],
  [228, 0],
  [228, 48],
]
const emptyOrigin = [0, 12]

export function MateriaSlot({
  atlas,
  tier,
  overmeld,
  name,
}: {
  atlas: MateriaAtlas | null
  tier: number | null
  overmeld: boolean
  name: string
}) {
  const label = `${overmeld ? '禁断' : '普通'}：${name}`
  if (adapter.name === 'ACT') {
    const grade =
      tier === null ? 'empty' : `grade${String(tier).padStart(2, '0')}`
    return (
      <img
        alt={label}
        src={`icon/materia/slot_${overmeld ? 'overmeld' : 'normal'}_${grade}.png`}
      />
    )
  }

  const origin = tier === null ? emptyOrigin : tierOrigins[tier]
  if (!atlas || !origin)
    return (
      <span className="gear-materia-text" role="img" aria-label={label}>
        {overmeld ? '+' : ''}
        {tier === null ? '○' : tier + 1}
      </span>
    )

  const { image, scale } = atlas
  const size = 24 * scale
  return (
    <canvas
      width={size}
      height={size}
      role="img"
      aria-label={label}
      ref={(canvas) => {
        const context = canvas?.getContext('2d')
        if (!context) return
        context.clearRect(0, 0, size, size)
        context.drawImage(
          image,
          origin[0] * scale,
          (origin[1] + (overmeld ? 24 : 0)) * scale,
          size,
          size,
          0,
          0,
          size,
          size,
        )
      }}
    />
  )
}
