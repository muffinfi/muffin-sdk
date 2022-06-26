import JSBI from 'jsbi'
import { TickMath } from './tickMath'

const ONE = JSBI.BigInt(1)
const Q72 = JSBI.leftShift(ONE, JSBI.BigInt(72))

describe('TickMath', () => {
  describe('#MIN_TICK', () => {
    it('equals correct value', () => {
      expect(TickMath.MIN_TICK).toEqual(-776363)
    })
  })

  describe('#MAX_TICK', () => {
    it('equals correct value', () => {
      expect(TickMath.MAX_TICK).toEqual(776363)
    })
  })

  describe('#tickToSqrtPriceX72', () => {
    it('throws for non integer', () => {
      expect(() => TickMath.tickToSqrtPriceX72(1.5)).toThrow('TICK')
    })

    it('throws for tick too small', () => {
      expect(() => TickMath.tickToSqrtPriceX72(TickMath.MIN_TICK - 1)).toThrow('TICK')
    })

    it('throws for tick too large', () => {
      expect(() => TickMath.tickToSqrtPriceX72(TickMath.MAX_TICK + 1)).toThrow('TICK')
    })

    it('returns the correct value for min tick', () => {
      expect(TickMath.tickToSqrtPriceX72(TickMath.MIN_TICK)).toEqual(TickMath.MIN_SQRT_PRICE)
    })

    it('returns the correct value for max tick', () => {
      expect(TickMath.tickToSqrtPriceX72(TickMath.MAX_TICK)).toEqual(TickMath.MAX_SQRT_PRICE)
    })

    it('returns the correct value for tick 0', () => {
      expect(TickMath.tickToSqrtPriceX72(0)).toEqual(Q72)
    })
  })

  describe('#sqrtPriceX72ToTick', () => {
    it('returns the correct value for sqrt price at min tick', () => {
      expect(TickMath.sqrtPriceX72ToTick(TickMath.MIN_SQRT_PRICE)).toEqual(TickMath.MIN_TICK)
    })

    it('returns the correct value for sqrt price at max tick', () => {
      expect(TickMath.sqrtPriceX72ToTick(TickMath.MAX_SQRT_PRICE)).toEqual(TickMath.MAX_TICK)
    })

    it('returns the correct value for sqrt price at tick 0', () => {
      expect(TickMath.sqrtPriceX72ToTick(Q72)).toEqual(0)
    })
  })
})
