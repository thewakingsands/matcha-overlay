import { expect, it, vi } from 'vitest'
import { MateriaSlot } from './materia-atlas'

vi.mock('../../../../adapter', () => ({ adapter: { name: 'Mojito' } }))
vi.mock('../../../../adapter/mojito', () => ({ queryMateriaAtlas: vi.fn() }))

it.each([1, 2] as const)(
  'draws the complete set of slots at scale %i',
  (scale) => {
    const image = {} as HTMLImageElement
    const context = { clearRect: vi.fn(), drawImage: vi.fn() }
    const size = 24 * scale
    for (const overmeld of [false, true]) {
      const origins = [
        [0, 12],
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
      origins.forEach(([x, y], index) => {
        const slot = MateriaSlot({
          atlas: { image, scale },
          tier: index ? index - 1 : null,
          overmeld,
          name: 'Example',
        })
        expect(slot.type).toBe('canvas')
        slot.props.ref({ getContext: () => context })
        expect(context.drawImage).toHaveBeenLastCalledWith(
          image,
          x * scale,
          (y + (overmeld ? 24 : 0)) * scale,
          size,
          size,
          0,
          0,
          size,
          size,
        )
      })
    }
  },
)
