import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { Trade } from '../entities/trade'
import { getAmountInDistribution, Hop } from './getPriceImpact'

/**
 * TODO: seems not making sense. pending to delete
 */
export function getRealizedFee<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hops: Hop[][]
): {
  percent: Percent
  amount: CurrencyAmount<TInput>
} {
  invariant(hops.length === trade.swaps.length, 'INVALID_HOPS')
  let overallGamma = new Percent(0)

  for (const [i, swap] of trade.swaps.entries()) {
    invariant(hops[i].length === swap.route.pools.length, 'INVALID_HOPS')

    let routeGamma = new Percent(1, 1)
    for (const [j, pool] of swap.route.pools.entries()) {
      let poolGamma = new Percent(0)
      for (const [tierId, amtInPercent] of getAmountInDistribution(hops[i][j], pool).entries()) {
        const sqrtGamma = pool.tiers[tierId].sqrtGamma
        const gamma = new Percent(sqrtGamma * sqrtGamma, 1e10)
        poolGamma = poolGamma.add(gamma.multiply(amtInPercent))
      }
      routeGamma = routeGamma.multiply(poolGamma)
    }

    const { numerator, denominator } = swap.inputAmount.divide(trade.inputAmount)
    const swapPercent = new Percent(numerator, denominator)
    overallGamma = overallGamma.add(routeGamma.multiply(swapPercent))
  }

  const percent = new Percent(1, 1).subtract(overallGamma)
  const amount = CurrencyAmount.fromRawAmount(trade.inputAmount.currency, trade.inputAmount.multiply(percent).quotient)

  return { percent, amount }
}
