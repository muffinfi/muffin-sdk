import { Fraction, Price, Token } from '@uniswap/sdk-core'
import {
  tryParseDecimal,
  priceToClosestTick,
  tickToPrice,
  withoutScientificNotation,
  feeToSqrtGamma,
  sqrtGammaToFee,
} from './misc'

describe('misc', () => {
  describe('priceTickConversions', () => {
    function token({
      sortOrder,
      decimals = 18,
      chainId = 1,
    }: {
      sortOrder: number
      decimals?: number
      chainId?: number
    }): Token {
      if (sortOrder > 9 || sortOrder % 1 !== 0) throw new Error('invalid sort order')
      return new Token(
        chainId,
        `0x${new Array<string>(40).fill(`${sortOrder}`).join('')}`,
        decimals,
        `T${sortOrder}`,
        `token${sortOrder}`
      )
    }
    const token0 = token({ sortOrder: 0 })
    const token1 = token({ sortOrder: 1 })
    const token2_6decimals = token({ sortOrder: 2, decimals: 6 })

    describe('#tickToPrice', () => {
      it('1800 t0/1 t1', () => {
        expect(tickToPrice(token1, token0, -74959).toSignificant(5)).toEqual('1800')
      })

      it('1 t1/1800 t0', () => {
        expect(tickToPrice(token0, token1, -74959).toSignificant(5)).toEqual('0.00055556')
      })

      it('1800 t1/1 t0', () => {
        expect(tickToPrice(token0, token1, 74959).toSignificant(5)).toEqual('1800')
      })

      it('1 t0/1800 t1', () => {
        expect(tickToPrice(token1, token0, 74959).toSignificant(5)).toEqual('0.00055556')
      })

      describe('12 decimal difference', () => {
        it('1.01 t2/1 t0', () => {
          expect(tickToPrice(token0, token2_6decimals, -276225).toSignificant(5)).toEqual('1.01')
        })

        it('1 t0/1.01 t2', () => {
          expect(tickToPrice(token2_6decimals, token0, -276225).toSignificant(5)).toEqual('0.99015')
        })

        it('1 t2/1.01 t0', () => {
          expect(tickToPrice(token0, token2_6decimals, -276423).toSignificant(5)).toEqual('0.99015')
        })

        it('1.01 t0/1 t2', () => {
          expect(tickToPrice(token2_6decimals, token0, -276423).toSignificant(5)).toEqual('1.0099')
        })

        it('1.01 t2/1 t0', () => {
          expect(tickToPrice(token0, token2_6decimals, -276225).toSignificant(5)).toEqual('1.01')
        })

        it('1 t0/1.01 t2', () => {
          expect(tickToPrice(token2_6decimals, token0, -276225).toSignificant(5)).toEqual('0.99015')
        })
      })
    })

    describe('#priceToClosestTick', () => {
      it('(special case) use tolerance to patch rounding error', () => {
        expect(Math.log(10001 / 10000) / Math.log(1.0001)).toBeCloseTo(1)
        expect(priceToClosestTick(new Price(token0, token1, '10000', '10001'))).toEqual(1)
        expect(priceToClosestTick(new Price(token0, token1, '10000', '10001'), new Fraction(0))).toEqual(0)

        expect(Math.log(10000 / 10001) / Math.log(1.0001)).toBeCloseTo(-1)
        expect(priceToClosestTick(new Price(token0, token1, '10001', '10000'))).toEqual(-1)
        expect(priceToClosestTick(new Price(token0, token1, '10001', '10000'), new Fraction(0))).toEqual(-2)
      })

      it('1800 t0/1 t1', () => {
        expect(priceToClosestTick(new Price(token1, token0, 1, 1800))).toEqual(-74960)
      })

      it('1 t1/1800 t0', () => {
        expect(priceToClosestTick(new Price(token0, token1, 1800, 1))).toEqual(-74960)
      })

      it('1.01 t2/1 t0', () => {
        expect(priceToClosestTick(new Price(token0, token2_6decimals, 100e18, 101e6))).toEqual(-276225)
      })

      it('1 t0/1.01 t2', () => {
        expect(priceToClosestTick(new Price(token2_6decimals, token0, 101e6, 100e18))).toEqual(-276225)
      })

      describe('reciprocal with tickToPrice', () => {
        it('1800 t0/1 t1', () => {
          expect(priceToClosestTick(tickToPrice(token1, token0, -74960))).toEqual(-74960)
        })

        it('1 t0/1800 t1', () => {
          expect(priceToClosestTick(tickToPrice(token1, token0, 74960))).toEqual(74960)
        })

        it('1 t1/1800 t0', () => {
          expect(priceToClosestTick(tickToPrice(token0, token1, -74960))).toEqual(-74960)
        })

        it('1800 t1/1 t0', () => {
          expect(priceToClosestTick(tickToPrice(token0, token1, 74960))).toEqual(74960)
        })

        it('1.01 t2/1 t0', () => {
          expect(priceToClosestTick(tickToPrice(token0, token2_6decimals, -276225))).toEqual(-276225)
        })

        it('1 t0/1.01 t2', () => {
          expect(priceToClosestTick(tickToPrice(token2_6decimals, token0, -276225))).toEqual(-276225)
        })
      })
    })
  })

  it('tryParseDecimal', () => {
    const check = (x: string, expected: [string, string, number] | undefined) => {
      const parsed = tryParseDecimal(x)
      if (expected === undefined) {
        expect(expected).toEqual(undefined)
      } else {
        expect(parsed).toMatchObject(expected)
        expect(parseFloat(`${expected[0]}${expected[1]}e${expected[2]}`)).toEqual(parseFloat(x))
      }
    }

    check('10', ['', '10', 0])
    check('1.0', ['', '10', -1])
    check('1.01', ['', '101', -2])

    check('10e+8', ['', '10', 8])
    check('10e-8', ['', '10', -8])

    check('1.23e+8', ['', '123', -2 + 8])
    check('1.23e+2', ['', '123', -2 + 2])
    check('1.23e+1', ['', '123', -2 + 1])
    check('1.23e+0', ['', '123', -2 + 0])
    check('1.23e-1', ['', '123', -2 - 1])
    check('1.23e-2', ['', '123', -2 - 2])
    check('1.23e-8', ['', '123', -2 - 8])

    check('0.012e-6', ['', '12', -3 - 6])
    check('0.012e-0', ['', '12', -3 - 0])
    check('0.012e+3', ['', '12', -3 + 3])
    check('0.012e+6', ['', '12', -3 + 6])
  })

  it('withoutScientificNotation', () => {
    const check = (x: string) => {
      const result = withoutScientificNotation(x)
      expect(result?.includes('e')).toBe(false)
      expect(parseFloat(withoutScientificNotation(x) ?? 'wut')).toEqual(parseFloat(x))
    }
    check('10')
    check('1.0')
    check('1.01')
    check('10e+8')
    check('10e-8')
    check('1.23e+8')
    check('1.23e+2')
    check('1.23e+1')
    check('1.23e+0')
    check('1.23e-1')
    check('1.23e-2')
    check('1.23e-8')
    check('0.012e-6')
    check('0.012e-0')
    check('0.012e+3')
    check('0.012e+6')
  })

  it('feeToSqrtGamma', () => {
    const check = (fee: Fraction, sqrtGamma: string) => {
      const sg = feeToSqrtGamma(fee).toString()
      expect(sg).toEqual(sqrtGamma)
      const fee2 = sqrtGammaToFee(+sg)
      expect(fee2.lessThan(fee)).toBe(true)
      expect(+fee2.divide(fee).toSignificant(10)).toBeGreaterThan(0.99)
    }

    check(new Fraction(20, 10000), '99900')
    check(new Fraction(40, 10000), '99800')
    check(new Fraction(60, 10000), '99700')
    check(new Fraction(80, 10000), '99600')
    check(new Fraction(100, 10000), '99499')

    check(new Fraction(5, 10000), '99975')
    check(new Fraction(10, 10000), '99950')
    check(new Fraction(20, 10000), '99900')
    check(new Fraction(30, 10000), '99850')
    check(new Fraction(40, 10000), '99800')

    check(new Fraction(4, 100000), '99998')
    check(new Fraction(1, 10000), '99995')
    check(new Fraction(3, 10000), '99985')
    check(new Fraction(5, 10000), '99975')
  })
})
