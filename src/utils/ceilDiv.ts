import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ONE, ZERO } from '../constants'

/**
 * Division and round up. Only non-negative numbers are allowed.
 * @param x A non-negative big integer
 * @param y A non-negative big integer
 */
export function ceilDiv(x: JSBI, y: JSBI): JSBI {
  invariant(JSBI.greaterThanOrEqual(x, ZERO) && JSBI.greaterThanOrEqual(y, ZERO), 'CEIL_DIV_NEGATIVE')
  const z = JSBI.divide(x, y)
  return JSBI.notEqual(JSBI.remainder(x, y), ZERO) ? JSBI.add(z, ONE) : z
}
