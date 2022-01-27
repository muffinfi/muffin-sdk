import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { Q72 } from '../constants'
import { ceilDiv } from './ceilDiv'

export const fromD8 = (x: JSBI): JSBI => JSBI.multiply(x, JSBI.BigInt(256))

export const toD8 = (x: JSBI): JSBI => JSBI.divide(x, JSBI.BigInt(256))

export abstract class PoolMath {
  /**
   * Compute the change of the pool's token0's reserve when price goes from sqrtPA to sqrtPB
   */
  public static getAmount0Delta(sqrtPA: JSBI, sqrtPB: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
    if (JSBI.greaterThan(sqrtPA, sqrtPB)) [sqrtPA, sqrtPB] = [sqrtPB, sqrtPA]
    const numerator = JSBI.multiply(JSBI.multiply(liquidity, JSBI.subtract(sqrtPB, sqrtPA)), Q72)
    const denominator = JSBI.multiply(sqrtPA, sqrtPB)
    return roundUp ? ceilDiv(numerator, denominator) : JSBI.divide(numerator, denominator)
  }

  /**
   * Compute the change of the pool's token1's reserve when price goes from sqrtPA to sqrtPB
   */
  public static getAmount1Delta(sqrtPA: JSBI, sqrtPB: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
    if (JSBI.greaterThan(sqrtPA, sqrtPB)) [sqrtPA, sqrtPB] = [sqrtPB, sqrtPA]
    const numerator = JSBI.multiply(liquidity, JSBI.subtract(sqrtPB, sqrtPA))
    return roundUp ? ceilDiv(numerator, Q72) : JSBI.divide(numerator, Q72)
  }

  /**
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   */
  public static maxOutputLiquidityD8ForAmounts(
    sqrtPCurrent: JSBI,
    sqrtPLower: JSBI,
    sqrtPUpper: JSBI,
    amount0: JSBI,
    amount1: JSBI
  ): JSBI {
    invariant(JSBI.lessThan(sqrtPLower, sqrtPUpper), 'SQRT_P')

    if (JSBI.lessThanOrEqual(sqrtPCurrent, sqrtPLower)) {
      // L = Δx (√P0 √P1) / (√P0 - √P1)
      return JSBI.divide(
        JSBI.multiply(amount0, JSBI.multiply(sqrtPLower, sqrtPUpper)),
        JSBI.multiply(JSBI.subtract(sqrtPUpper, sqrtPLower), Q72)
      )
    }

    if (JSBI.greaterThanOrEqual(sqrtPCurrent, sqrtPUpper)) {
      // L = Δy / (√P0 - √P1)
      return JSBI.divide(JSBI.multiply(amount1, Q72), JSBI.subtract(sqrtPUpper, sqrtPLower))
    }

    const liquidity0 = JSBI.divide(
      JSBI.multiply(amount0, JSBI.multiply(sqrtPCurrent, sqrtPUpper)),
      JSBI.multiply(JSBI.subtract(sqrtPUpper, sqrtPCurrent), Q72)
    )
    const liquidity1 = JSBI.divide(JSBI.multiply(amount1, Q72), JSBI.subtract(sqrtPCurrent, sqrtPLower))
    const liquidity = JSBI.lessThan(liquidity0, liquidity1) ? liquidity0 : liquidity1

    return toD8(liquidity)
  }

  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the pool
   */
  public static minInputAmountsForLiquidityD8(
    sqrtPCurrent: JSBI,
    sqrtPLower: JSBI,
    sqrtPUpper: JSBI,
    liquidityD8: JSBI
  ): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    invariant(JSBI.lessThan(sqrtPLower, sqrtPUpper), 'SQRT_P')

    let sqrtPExit
    if (JSBI.lessThan(sqrtPCurrent, sqrtPLower)) {
      sqrtPExit = sqrtPLower
    } else if (JSBI.greaterThan(sqrtPCurrent, sqrtPUpper)) {
      sqrtPExit = sqrtPUpper
    } else {
      sqrtPExit = sqrtPCurrent
    }

    return {
      amount0: this.getAmount0Delta(sqrtPUpper, sqrtPExit, fromD8(liquidityD8), true),
      amount1: this.getAmount1Delta(sqrtPLower, sqrtPExit, fromD8(liquidityD8), true)
    }
  }
}
