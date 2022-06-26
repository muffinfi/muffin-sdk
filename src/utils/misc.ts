import { BigintIsh, Fraction, Price, sqrt, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { E10, MAX_SQRT_PRICE, MAX_TICK, MIN_SQRT_PRICE, MIN_TICK, Q144 } from '../constants'
import { TickMath } from './tickMath'

/*====================================================================
 *                               FEE
 *===================================================================*/

export function isValidSqrtGamma(sqrtGamma: number | undefined): sqrtGamma is number {
  return sqrtGamma != null && Number.isInteger(sqrtGamma) && sqrtGamma > 0 && sqrtGamma <= 100_000
}

/**
 * Convert sqrt gamma to fee, a value in [0, 1]
 * @param sqrtGamma Sqrt gamma. Assumed it is valid.
 * @return Fee, in [0, 1]
 */
export const sqrtGammaToFee = (sqrtGamma: number): Fraction => {
  const sg = JSBI.BigInt(sqrtGamma)
  const gamma = JSBI.multiply(sg, sg)
  return new Fraction(JSBI.subtract(E10, gamma), E10)
}

/**
 * Convert sqrt gamma to fee percent, a value in [0, 100]
 * @param sqrtGamma Sqrt gamma. Assumed it is valid.
 * @return Fee percent, in [0, 100]
 */
export const sqrtGammaToFeePercent = (sqrtGamma: number): Fraction => {
  return sqrtGammaToFee(sqrtGamma).multiply(100)
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

/**
 * Returns true if the given sqrt price is in supported price range
 */
export const isSqrtPriceSupported = (sqrtPriceX72: JSBI): boolean => {
  return JSBI.greaterThanOrEqual(sqrtPriceX72, MIN_SQRT_PRICE) && JSBI.lessThanOrEqual(sqrtPriceX72, MAX_SQRT_PRICE)
}

/*====================================================================
 *                              TICK
 *===================================================================*/

/**
 * Returns the closest tick that is nearest a given tick and usable for the given tick spacing
 * @param tick the target tick
 * @param tickSpacing the spacing of the pool
 */
export function nearestUsableTick(tick: number, tickSpacing: number): number {
  invariant(Number.isInteger(tick) && Number.isInteger(tickSpacing), 'INTEGERS')
  invariant(tickSpacing > 0, 'TICK_SPACING')
  invariant(tick >= MIN_TICK && tick <= MAX_TICK, 'TICK_BOUND')

  const rounded = Math.round(tick / tickSpacing) * tickSpacing
  if (rounded < MIN_TICK) return rounded + tickSpacing
  if (rounded > MAX_TICK) return rounded - tickSpacing
  return rounded
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

  if (sorted) {
    if (!price.asFraction.multiply(factor).lessThan(priceNextTick.asFraction)) tick++
  } else {
    if (!price.asFraction.divide(factor).greaterThan(priceNextTick.asFraction)) tick++
  }
  return tick
}
