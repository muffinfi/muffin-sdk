import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { Trade } from '../entities/trade'
import { getInputAmountDistribution, Hop } from './getInputAmountDistribution'

/**
 * @deprecated TODO: seems not making sense. pending to delete
 */
export function getRealizedFee<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hopsList: Hop[][]
): {
  percent: Percent
  amount: CurrencyAmount<TInput>
} {
  // reverse hops direction if exact output
  if (trade.tradeType === TradeType.EXACT_OUTPUT) {
    hopsList = hopsList.map((hops) => [...hops].reverse())
  }

  invariant(hopsList.length === trade.swaps.length, 'INVALID_HOPS_LIST_LENGTH')
  let overallGamma = new Percent(0)

  for (const [i, swap] of trade.swaps.entries()) {
    invariant(hopsList[i].length === swap.route.pools.length, 'INVALID_HOPS_LENGTH')

    let routeGamma = new Percent(1, 1)
    for (const [j, pool] of swap.route.pools.entries()) {
      invariant(hopsList[i][j].tierAmountsIn.length <= pool.tiers.length, 'INVALID_AMOUNTS_IN_LENGTH')

      let poolGamma = new Percent(0)
      for (const [tierId, amtInPercent] of getInputAmountDistribution(hopsList[i][j]).entries()) {
        const sqrtGamma = pool.tiers[tierId].sqrtGamma
        const gamma = new Percent(sqrtGamma * sqrtGamma, 1e10)
        poolGamma = poolGamma.add(gamma.multiply(amtInPercent))
      }
      routeGamma = routeGamma.multiply(poolGamma)
    }

    const swapPercent = swap.inputAmount.divide(trade.inputAmount).asFraction
    overallGamma = overallGamma.add(routeGamma.multiply(swapPercent))
  }

  const percent = new Percent(1, 1).subtract(overallGamma)
  const amount = CurrencyAmount.fromRawAmount(trade.inputAmount.currency, trade.inputAmount.multiply(percent).quotient)

  return { percent, amount }
}
