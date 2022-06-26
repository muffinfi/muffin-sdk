import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { Q72, ZERO } from '../constants'
import { ceilDiv } from './ceilDiv'

export const fromD8 = (x: JSBI): JSBI => JSBI.multiply(x, JSBI.BigInt(256))
export const toD8 = (x: JSBI): JSBI => JSBI.divide(x, JSBI.BigInt(256))

const negate = (x: JSBI): JSBI => JSBI.multiply(x, JSBI.BigInt(-1))
const abs = (x: JSBI): JSBI => (JSBI.lessThan(x, ZERO) ? negate(x) : x)

export abstract class PoolMath {
  /*==============================================================
   *                 SQRT PRICE => TOKEN AMOUNTS
   *=============================================================*/

  /**
   * Compute the change of the pool's token0's reserve when price goes from sqrtP0 to sqrtP1,
   * i.e. Δx = L (√P0 - √P1) / (√P0 √P1).
   * If the price goes down, token0 amount is an input (+ve),   and rounds away from zero.
   * If the price goes up,   token0 amount is an output (-ve),  and rounds towards zero.
   *
   * @param sqrtP0 Initial price
   * @param sqrtP1 Final price
   * @param liquidity Amount of liquidity
   * @returns Change of the token0 reserve of the pool. Can be negative.
   */
  public static calcAmount0Delta(sqrtP0: JSBI, sqrtP1: JSBI, liquidity: JSBI): JSBI {
    const priceUp = JSBI.greaterThan(sqrtP1, sqrtP0)
    if (priceUp) [sqrtP0, sqrtP1] = [sqrtP1, sqrtP0]

    const numerator = JSBI.multiply(JSBI.multiply(liquidity, JSBI.subtract(sqrtP0, sqrtP1)), Q72)
    const denominator = JSBI.multiply(sqrtP0, sqrtP1)

    return priceUp ? negate(JSBI.divide(numerator, denominator)) : ceilDiv(numerator, denominator)
  }

  /**
   * Compute the change of the pool's token1's reserve when price goes from sqrtP0 to sqrtP1,
   * i.e. Δy = L (√P1 - √P0).
   * If the price goes down, token1 amount is an output (-ve),  and rounds towards zero.
   * If the price goes up,   token1 amount is an input (+ve),   and rounds away from zero.
   *
   * @param sqrtP0 Initial price
   * @param sqrtP1 Final price
   * @param liquidity Amount of liquidity
   * @returns Change of the token1 reserve of the pool. Can be negative.
   */
  public static calcAmount1Delta(sqrtP0: JSBI, sqrtP1: JSBI, liquidity: JSBI): JSBI {
    const priceDown = JSBI.lessThan(sqrtP1, sqrtP0)
    if (priceDown) [sqrtP0, sqrtP1] = [sqrtP1, sqrtP0]

    const numerator = JSBI.multiply(liquidity, JSBI.subtract(sqrtP1, sqrtP0))
    return priceDown ? negate(JSBI.divide(numerator, Q72)) : ceilDiv(numerator, Q72)
  }

  /*==============================================================
   *                  LIQUIDITY => TOKEN AMOUNTS
   *=============================================================*/

  /**
   * Returns the amounts liquidity held by the position at the current price for the pool
   *
   * @param sqrtPCurrent Current price of the tier
   * @param sqrtPLower Position's lower price boundary
   * @param sqrtPUpper Position's upper price boundary
   * @param liquidityDeltaD8 Delta of the liquidity of the tier (i.e. +ve means mint, -ve means burn)
   * @returns Token amounts. Non-negative regardless of the sign of `liquidityDeltaD8`.
   */
  public static amountsForLiquidityDeltaD8(
    sqrtPCurrent: JSBI,
    sqrtPLower: JSBI,
    sqrtPUpper: JSBI,
    liquidityDeltaD8: JSBI // can be negative
  ): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    invariant(JSBI.lessThan(sqrtPLower, sqrtPUpper), 'SQRT_P')

    let sqrtP: JSBI
    if (JSBI.lessThan(sqrtPCurrent, sqrtPLower)) {
      sqrtP = sqrtPLower
    } else if (JSBI.greaterThan(sqrtPCurrent, sqrtPUpper)) {
      sqrtP = sqrtPUpper
    } else {
      sqrtP = sqrtPCurrent
    }

    const liquidity = fromD8(abs(liquidityDeltaD8))
    return JSBI.greaterThanOrEqual(liquidityDeltaD8, ZERO)
      ? {
          // round up, since they are input amounts for the increase in liquidity
          amount0: this.calcAmount0Delta(sqrtPUpper, sqrtP, liquidity),
          amount1: this.calcAmount1Delta(sqrtPLower, sqrtP, liquidity),
        }
      : {
          // round down, since they are output amounts for the decrease in liquidity
          amount0: negate(this.calcAmount0Delta(sqrtP, sqrtPUpper, liquidity)),
          amount1: negate(this.calcAmount1Delta(sqrtP, sqrtPLower, liquidity)),
        }
  }

  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the pool.
   */
  public static minInputAmountsForLiquidityD8(
    sqrtPCurrent: JSBI,
    sqrtPLower: JSBI,
    sqrtPUpper: JSBI,
    liquidityIncreaseD8: JSBI
  ): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    invariant(JSBI.greaterThanOrEqual(liquidityIncreaseD8, ZERO), 'NEGATIVE_LIQUIDTY_INCREASE')
    return this.amountsForLiquidityDeltaD8(sqrtPCurrent, sqrtPLower, sqrtPUpper, liquidityIncreaseD8)
  }

  /**
   * Returns the minimum amounts expected from burning the amount of liquidity held by the position at the current
   * price for the pool
   */
  public static minOutputAmountsForLiquidityD8(
    sqrtPCurrent: JSBI,
    sqrtPLower: JSBI,
    sqrtPUpper: JSBI,
    liquidityDecreaseD8: JSBI
  ): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    invariant(JSBI.greaterThanOrEqual(liquidityDecreaseD8, ZERO), 'NEGATIVE_LIQUIDTY_INCREASE')
    return this.amountsForLiquidityDeltaD8(sqrtPCurrent, sqrtPLower, sqrtPUpper, negate(liquidityDecreaseD8))
  }

  /*==============================================================
   *                 TOKEN AMOUNTS => LIQUIDITY
   *=============================================================*/

  /**
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   */
  public static maxOutputLiquidityForAmounts(
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
    return JSBI.lessThan(liquidity0, liquidity1) ? liquidity0 : liquidity1
  }

  /**
   * Computes the maximum amount of liquidityD8 received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   */
  public static maxOutputLiquidityD8ForAmounts(
    ...args: Parameters<typeof PoolMath.maxOutputLiquidityForAmounts>
  ): JSBI {
    return toD8(this.maxOutputLiquidityForAmounts(...args))
  }
}
