import { sqrt } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { Q144, ZERO } from '../constants'
import { PoolMath } from './poolMath'

const abs = (x: JSBI): JSBI => (JSBI.lessThan(x, ZERO) ? JSBI.multiply(x, JSBI.BigInt(-1)) : x)

const closeTo = (x: JSBI | number, y: JSBI | number, maxAbsDiff = 1): boolean => {
  return Math.abs(Number(x) - Number(y)) <= maxAbsDiff
}

describe('poolMath', () => {
  test('calcAmount0Delta', () => {
    const calc = (price0: number, price1: number, liquidity: number) => {
      // Δx = L (√P0 - √P1) / (√P0 √P1).
      const _sqrtP0 = sqrt(JSBI.multiply(JSBI.BigInt(price0), Q144))
      const _sqrtP1 = sqrt(JSBI.multiply(JSBI.BigInt(price1), Q144))
      const _liquidity = JSBI.BigInt(liquidity)
      const amount0 = PoolMath.calcAmount0Delta(_sqrtP0, _sqrtP1, _liquidity)
      const control = (liquidity * (Math.sqrt(price0) - Math.sqrt(price1))) / (Math.sqrt(price0) * Math.sqrt(price1))
      return { amount0, control }
    }

    const priceIncrease = calc(1, 2, 1000000000)
    const priceDecrease = calc(2, 1, 1000000000)

    // test calculation
    expect(closeTo(priceIncrease.amount0, priceIncrease.control)).toEqual(true)
    expect(closeTo(priceDecrease.amount0, priceDecrease.control)).toEqual(true)

    // test sign
    expect(JSBI.LT(priceIncrease.amount0, 0)).toEqual(true)
    expect(JSBI.GT(priceDecrease.amount0, 0)).toEqual(true)

    // test rounding
    const diff = JSBI.subtract(abs(priceDecrease.amount0), abs(priceIncrease.amount0))
    expect(JSBI.EQ(diff, 0) || JSBI.EQ(diff, 1)).toEqual(true)
  })

  test('calcAmount1Delta', () => {
    const calc = (price0: number, price1: number, liquidity: number) => {
      // Δy = L (√P0 - √P1)
      const _sqrtP0 = sqrt(JSBI.multiply(JSBI.BigInt(price0), Q144))
      const _sqrtP1 = sqrt(JSBI.multiply(JSBI.BigInt(price1), Q144))
      const _liquidity = JSBI.BigInt(liquidity)
      const amount1 = PoolMath.calcAmount1Delta(_sqrtP0, _sqrtP1, _liquidity)
      const control = liquidity * (Math.sqrt(price1) - Math.sqrt(price0))
      return { amount1, control }
    }

    const priceIncrease = calc(1, 2, 1000000000)
    const priceDecrease = calc(2, 1, 1000000000)

    // test calculation
    expect(closeTo(priceIncrease.amount1, priceIncrease.control)).toEqual(true)
    expect(closeTo(priceDecrease.amount1, priceDecrease.control)).toEqual(true)

    // test sign
    expect(JSBI.GT(priceIncrease.amount1, 0)).toEqual(true)
    expect(JSBI.LT(priceDecrease.amount1, 0)).toEqual(true)

    // test rounding
    const diff = JSBI.subtract(abs(priceIncrease.amount1), abs(priceDecrease.amount1))
    expect(JSBI.EQ(diff, 0) || JSBI.EQ(diff, 1)).toEqual(true)
  })

  test('amountsForLiquidityDeltaD8', () => {
    const priceLower = 1
    const priceCurrent = 2
    const priceUpper = 4
    const liquidityDeltaD8 = 390625

    const _sqrtPLower = sqrt(JSBI.multiply(JSBI.BigInt(priceLower), Q144))
    const _sqrtPCurrent = sqrt(JSBI.multiply(JSBI.BigInt(priceCurrent), Q144))
    const _sqrtPUpper = sqrt(JSBI.multiply(JSBI.BigInt(priceUpper), Q144))

    const mint = PoolMath.amountsForLiquidityDeltaD8(_sqrtPLower, _sqrtPCurrent, _sqrtPUpper, JSBI.BigInt(+liquidityDeltaD8)) // prettier-ignore
    const burn = PoolMath.amountsForLiquidityDeltaD8(_sqrtPLower, _sqrtPCurrent, _sqrtPUpper, JSBI.BigInt(-liquidityDeltaD8)) // prettier-ignore

    // test non-negative
    expect(JSBI.greaterThanOrEqual(mint.amount0, ZERO) && JSBI.greaterThanOrEqual(mint.amount1, ZERO)).toEqual(true) // prettier-ignore
    expect(JSBI.greaterThanOrEqual(burn.amount0, ZERO) && JSBI.greaterThanOrEqual(burn.amount1, ZERO)).toEqual(true) // prettier-ignore

    // test rounding
    const amt0Diff = JSBI.subtract(mint.amount0, burn.amount0)
    const amt1Diff = JSBI.subtract(mint.amount1, burn.amount1)
    expect(JSBI.EQ(amt0Diff, 0) || JSBI.EQ(amt0Diff, 1)).toEqual(true)
    expect(JSBI.EQ(amt1Diff, 0) || JSBI.EQ(amt1Diff, 1)).toEqual(true)
  })
})
