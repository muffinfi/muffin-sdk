import { Percent, BigintIsh } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { ZERO } from '../../constants'

/**
 * BigintIsh | ethers.BigNumber
 */
type BigNumberish = BigintIsh | { toString(): string }

/**
 * `Hop` is a simulation result of a hop between pools in a swap route, retrieved on-chain from
 * `quoterContract.simulate`.
 */
export interface Hop {
  /** Input amounts respectively for the tiers in the pool  */
  tierAmountsIn: BigNumberish[]
}

/**
 * Convert a simulated hop to a list of input amount percentage for each tier
 * @param hop Simulation result of a hop
 * @returns List of input amount percentage
 */
export function getInputAmountDistribution(hop: Hop): Percent[] {
  const tierAmtsIn = hop.tierAmountsIn.map((amtIn) => JSBI.BigInt(amtIn))
  const sumAmtIn = tierAmtsIn.reduce((acc, amtIn) => JSBI.add(acc, amtIn), ZERO)

  return JSBI.equal(sumAmtIn, ZERO)
    ? tierAmtsIn.map(() => new Percent(1, tierAmtsIn.length)) // if zero sumAmtIn, distribute evenly to each tier
    : tierAmtsIn.map((amtIn) => new Percent(amtIn, sumAmtIn))
}
