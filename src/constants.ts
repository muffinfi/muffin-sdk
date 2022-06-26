import JSBI from 'jsbi'

// Contract constants

/** Minimum tick supported in Muffin */
export const MIN_TICK = -776363

/** Maximum tick supported in Muffin */
export const MAX_TICK = 776363

/** Minimum sqrt price supported, i.e. TickMath.tickToSqrtPriceX72(MIN_TICK)  */
export const MIN_SQRT_PRICE = JSBI.BigInt('65539')

/** Maximum sqrt price supported, i.e. TickMath.tickToSqrtPriceX72(MAX_TICK)  */
export const MAX_SQRT_PRICE = JSBI.BigInt('340271175397327323250730767849398346765')

/** Tier's base liquidity, scaled down 2^8 times */
export const BASE_LIQUIDITY_D8 = JSBI.BigInt('100')

/** Tolerable difference between desired and actual swap amounts */
export const SWAP_AMOUNT_TOLERANCE = JSBI.BigInt('100')

/** Maximum number of tiers per tier */
export const MAX_TIERS = 6

/** Choose all tiers to allow swapping */
export const MAX_TIER_CHOICES = (1 << MAX_TIERS) - 1

/** Position's limit order type */
export enum LimitOrderType {
  NotLimitOrder = 0,
  ZeroForOne = 1,
  OneForZero = 2,
}

// Common variables
export const ZERO = JSBI.BigInt(0)
export const ONE = JSBI.BigInt(1)
export const TWO = JSBI.BigInt(2)
export const Q72 = JSBI.leftShift(ONE, JSBI.BigInt(72))
export const Q144 = JSBI.leftShift(ONE, JSBI.BigInt(144))
export const MaxUint256 = JSBI.subtract(JSBI.leftShift(ONE, JSBI.BigInt(256)), ONE)
export const MaxUint128 = JSBI.subtract(JSBI.leftShift(ONE, JSBI.BigInt(128)), ONE)

export const E5 = JSBI.BigInt('100000')
export const E10 = JSBI.multiply(E5, E5)
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
