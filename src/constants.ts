import JSBI from 'jsbi'

// Contract constants
export const MIN_TICK = -776363
export const MAX_TICK = 776363
export const MIN_SQRT_P = JSBI.BigInt('65539')
export const MAX_SQRT_P = JSBI.BigInt('340271175397327323250730767849398346765')
export const BASE_LIQUIDITY_D8 = 100
export const BASE_LIQUIDITY = 100 * 2 ** 8
export enum LimitOrderType {
  NotLimitOrder = 0,
  ZeroForOne = 1,
  OneForZero = 2,
}
export const SWAP_AMOUNT_TOLERANCE = JSBI.BigInt('100')

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
