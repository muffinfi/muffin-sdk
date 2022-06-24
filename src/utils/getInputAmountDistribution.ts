import { Percent } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { ZERO } from '../constants'

interface BigNumberish {
  toString(): string
}

export interface Hop {
  tierAmountsIn: BigNumberish[]
}

export function getInputAmountDistribution(hop: Hop): Percent[] {
  const tierAmtsIn = hop.tierAmountsIn.map((amtIn) => JSBI.BigInt(amtIn.toString()))
  const sumAmtIn = tierAmtsIn.reduce((acc, amtIn) => JSBI.add(acc, amtIn), ZERO)

  return JSBI.equal(sumAmtIn, ZERO)
    ? tierAmtsIn.map(() => new Percent(1, tierAmtsIn.length)) // if zero sumAmtIn, distribute evenly to each tier
    : tierAmtsIn.map((amtIn) => new Percent(amtIn, sumAmtIn))
}
