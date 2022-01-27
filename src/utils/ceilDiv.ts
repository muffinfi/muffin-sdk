import JSBI from 'jsbi'
import { ONE, ZERO } from '../constants'

export function ceilDiv(x: JSBI, y: JSBI): JSBI {
  const z = JSBI.divide(x, y)
  return JSBI.notEqual(JSBI.remainder(x, y), ZERO) ? JSBI.add(z, ONE) : z
}
