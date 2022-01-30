import { BigintIsh, Fraction, Price, sqrt, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { MAX_SQRT_P, MAX_TICK, MIN_SQRT_P, MIN_TICK, Q72, Q144, SQRT_GAMMAS_FIRST_TIER } from '../constants'
import { TickMath } from './tickMath'

/*====================================================================
 *                               FEE
 *===================================================================*/

export function isValidSqrtGamma(sqrtGamma: number | undefined): sqrtGamma is number {
  return sqrtGamma != null && sqrtGamma > 0 && sqrtGamma <= 100_000
}

export function isValidFirstTierSqrtGamma(sqrtGamma: number | undefined) {
  return sqrtGamma != null && SQRT_GAMMAS_FIRST_TIER.includes(sqrtGamma)
}

/*====================================================================
 *                           SQRT PRICE
 *===================================================================*/

/**
 * Returns the sqrt ratio as a Q56.72 corresponding to a given ratio of amount1 and amount0
 * @param amount1 The numerator amount i.e., the amount of token1
 * @param amount0 The denominator amount i.e., the amount of token0
 * @returns The sqrt ratio
 */
export function encodeSqrtPriceX72(amount1: BigintIsh, amount0: BigintIsh): JSBI {
  const numerator = JSBI.leftShift(JSBI.BigInt(amount1), JSBI.BigInt(144))
  const denominator = JSBI.BigInt(amount0)
  const ratioX144 = JSBI.divide(numerator, denominator)
  return sqrt(ratioX144)
}

export const isSqrtPriceSupported = (sqrtPriceX72: JSBI) => {
  return JSBI.greaterThanOrEqual(sqrtPriceX72, MIN_SQRT_P) && JSBI.lessThanOrEqual(sqrtPriceX72, MAX_SQRT_P)
}

/*====================================================================
 *                              TICK
 *===================================================================*/

/**
 * Returns the closest tick that is nearest a given tick and usable for the given tick spacing
 * @param tick the target tick
 * @param tickSpacing the spacing of the pool
 */
export function nearestUsableTick(tick: number, tickSpacing: number) {
  invariant(Number.isInteger(tick) && Number.isInteger(tickSpacing), 'INTEGERS')
  invariant(tickSpacing > 0, 'TICK_SPACING')
  invariant(tick >= MIN_TICK && tick <= MAX_TICK, 'TICK_BOUND')

  const rounded = Math.round(tick / tickSpacing) * tickSpacing
  if (rounded < MIN_TICK) return rounded + tickSpacing
  else if (rounded > MAX_TICK) return rounded - tickSpacing
  else return rounded
}

/*====================================================================
 *                          PRICE <> TICK
 *===================================================================*/

/**
 * Returns a price object corresponding to the input tick and the base/quote token
 * Inputs must be tokens because the address order is used to interpret the price represented by the tick
 * @param baseToken the base token of the price
 * @param quoteToken the quote token of the price
 * @param tick the tick for which to return the price
 */
export function tickToPrice(baseToken: Token, quoteToken: Token, tick: number): Price<Token, Token> {
  const sqrtPriceX72 = TickMath.tickToSqrtPriceX72(tick)
  const priceX144 = JSBI.multiply(sqrtPriceX72, sqrtPriceX72)

  return baseToken.sortsBefore(quoteToken)
    ? new Price(baseToken, quoteToken, Q144, priceX144)
    : new Price(baseToken, quoteToken, priceX144, Q144)
}

/**
 * Returns the first tick for which the given price is greater than or equal to the tick price
 * @param price for which to return the closest tick that represents a price less than or equal to the input price,
 * i.e. the price of the returned tick is less than or equal to the input price
 * @param tolerance the % amount we add to the given price to see if it reaches the next tick's price. If so, we treat the
 * next tick's price as the closest price. This is to compensate the rounding error when turning price into sqrtPriceX72
 */
export function priceToClosestTick(
  price: Price<Token, Token>,
  tolerance: Fraction = new Fraction('1', '1000000000000000000000') // 1e-21
): number {
  const sorted = price.baseCurrency.sortsBefore(price.quoteCurrency)
  const sqrtPriceX72 = sorted
    ? encodeSqrtPriceX72(price.numerator, price.denominator)
    : encodeSqrtPriceX72(price.denominator, price.numerator)

  let tick = TickMath.sqrtPriceX72ToTick(sqrtPriceX72)
  const priceNextTick = tickToPrice(price.baseCurrency, price.quoteCurrency, tick + 1)

  const factor = new Fraction(1).add(tolerance)
  const ratio = new Fraction(price.numerator, price.denominator)
  const ratioNextTick = new Fraction(priceNextTick.numerator, priceNextTick.denominator)

  if (sorted) {
    if (!ratio.multiply(factor).lessThan(ratioNextTick)) tick++
  } else {
    if (!ratio.divide(factor).greaterThan(ratioNextTick)) tick++
  }
  return tick
}
