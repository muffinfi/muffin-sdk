import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { MaxUint256, MAX_SQRT_PRICE, MAX_TICK, MIN_SQRT_PRICE, MIN_TICK, ONE, TWO, ZERO } from '../constants'
import { mostSignificantBit } from './mostSignificantBit'

const Q56 = JSBI.exponentiate(TWO, JSBI.BigInt(56))
const Q128 = JSBI.exponentiate(TWO, JSBI.BigInt(128))

const mulShift = (val: JSBI, mulBy: string) => {
  return JSBI.signedRightShift(JSBI.multiply(val, JSBI.BigInt(mulBy)), JSBI.BigInt(128))
}

export abstract class TickMath {
  // Cannot be constructed.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static MIN_TICK: number = MIN_TICK
  public static MAX_TICK: number = MAX_TICK
  public static MIN_SQRT_PRICE: JSBI = MIN_SQRT_PRICE
  public static MAX_SQRT_PRICE: JSBI = MAX_SQRT_PRICE

  /**
   * Convert tick to sqrt price
   */
  public static tickToSqrtPriceX72(tick: number): JSBI {
    invariant(tick >= this.MIN_TICK && tick <= this.MAX_TICK && Number.isInteger(tick), 'TICK')
    const x = tick < 0 ? -tick : tick

    let ratio: JSBI = JSBI.BigInt('0x100000000000000000000000000000000')
    if ((x & 0x1) !== 0) ratio = mulShift(ratio, '0xfffcb933bd6fad37aa2d162d1a594001')
    if ((x & 0x2) !== 0) ratio = mulShift(ratio, '0xfff97272373d413259a46990580e213a')
    if ((x & 0x4) !== 0) ratio = mulShift(ratio, '0xfff2e50f5f656932ef12357cf3c7fdcc')
    if ((x & 0x8) !== 0) ratio = mulShift(ratio, '0xffe5caca7e10e4e61c3624eaa0941cd0')
    if ((x & 0x10) !== 0) ratio = mulShift(ratio, '0xffcb9843d60f6159c9db58835c926644')
    if ((x & 0x20) !== 0) ratio = mulShift(ratio, '0xff973b41fa98c081472e6896dfb254c0')
    if ((x & 0x40) !== 0) ratio = mulShift(ratio, '0xff2ea16466c96a3843ec78b326b52861')
    if ((x & 0x80) !== 0) ratio = mulShift(ratio, '0xfe5dee046a99a2a811c461f1969c3053')
    if ((x & 0x100) !== 0) ratio = mulShift(ratio, '0xfcbe86c7900a88aedcffc83b479aa3a4')
    if ((x & 0x200) !== 0) ratio = mulShift(ratio, '0xf987a7253ac413176f2b074cf7815e54')
    if ((x & 0x400) !== 0) ratio = mulShift(ratio, '0xf3392b0822b70005940c7a398e4b70f3')
    if ((x & 0x800) !== 0) ratio = mulShift(ratio, '0xe7159475a2c29b7443b29c7fa6e889d9')
    if ((x & 0x1000) !== 0) ratio = mulShift(ratio, '0xd097f3bdfd2022b8845ad8f792aa5825')
    if ((x & 0x2000) !== 0) ratio = mulShift(ratio, '0xa9f746462d870fdf8a65dc1f90e061e5')
    if ((x & 0x4000) !== 0) ratio = mulShift(ratio, '0x70d869a156d2a1b890bb3df62baf32f7')
    if ((x & 0x8000) !== 0) ratio = mulShift(ratio, '0x31be135f97d08fd981231505542fcfa6')
    if ((x & 0x10000) !== 0) ratio = mulShift(ratio, '0x9aa508b5b7a84e1c677de54f3e99bc9')
    if ((x & 0x20000) !== 0) ratio = mulShift(ratio, '0x5d6af8dedb81196699c329225ee604')
    if ((x & 0x40000) !== 0) ratio = mulShift(ratio, '0x2216e584f5fa1ea926041bedfe98')
    if ((x & 0x80000) !== 0) ratio = mulShift(ratio, '0x48a170391f7dc42444e8fa2')

    if (tick > 0) ratio = JSBI.divide(MaxUint256, ratio)

    return JSBI.greaterThan(JSBI.remainder(ratio, Q56), ZERO)
      ? JSBI.add(JSBI.divide(ratio, Q56), ONE)
      : JSBI.divide(ratio, Q56)
  }

  /**
   * Convert sqrt price to tick
   */
  public static sqrtPriceX72ToTick(sqrtPriceX72: JSBI): number {
    invariant(JSBI.greaterThanOrEqual(sqrtPriceX72, this.MIN_SQRT_PRICE), 'SQRT_RATIO')
    invariant(JSBI.lessThanOrEqual(sqrtPriceX72, this.MAX_SQRT_PRICE), 'SQRT_RATIO')

    const msb = mostSignificantBit(sqrtPriceX72)
    let log2 = JSBI.leftShift(JSBI.subtract(JSBI.BigInt(msb), JSBI.BigInt(72)), JSBI.BigInt(64))
    let z = JSBI.leftShift(sqrtPriceX72, JSBI.BigInt(127 - msb))

    for (let i = 0; i < 18; i++) {
      z = JSBI.signedRightShift(JSBI.multiply(z, z), JSBI.BigInt(127))
      if (JSBI.greaterThanOrEqual(z, Q128)) {
        z = JSBI.signedRightShift(z, ONE)
        log2 = JSBI.bitwiseOr(log2, JSBI.leftShift(ONE, JSBI.BigInt(63 - i)))
      }
    }

    const logBaseSqrt10001 = JSBI.multiply(log2, JSBI.BigInt('255738958999603826347141'))
    const tickHigh = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.add(logBaseSqrt10001, JSBI.BigInt('17996007701288367970265332090599899137')),
        JSBI.BigInt(128)
      )
    )
    const tickLow = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.subtract(
          logBaseSqrt10001,
          JSBI.lessThan(logBaseSqrt10001, JSBI.BigInt('-230154402537746701963478439606373042805014528'))
            ? JSBI.BigInt('98577143636729737466164032634120830977')
            : JSBI.lessThan(logBaseSqrt10001, JSBI.BigInt('-162097929153559009270803518120019400513814528'))
            ? JSBI.BigInt('527810000259722480933883300202676225')
            : ZERO
        ),
        JSBI.BigInt(128)
      )
    )

    return tickLow === tickHigh || JSBI.greaterThanOrEqual(sqrtPriceX72, this.tickToSqrtPriceX72(tickHigh))
      ? tickHigh
      : tickLow
  }
}
