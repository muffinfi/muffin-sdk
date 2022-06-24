import { Currency, Fraction, Price, Token, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { Route } from '../entities/route'
import { Trade } from '../entities/trade'
import { getInputAmountDistribution, Hop } from './getInputAmountDistribution'

/**
 * Calculate the marginal swap price of a trade
 * @param trade     Trade instance
 * @param hopsList  List of simulated hops from quoter contract
 * @returns         Marginal swap price of the trade
 */
export function getTradeMarginalPrice<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hopsList: Hop[][]
): Price<TInput, TOutput> {
  // reverse hops direction if exact output
  if (trade.tradeType === TradeType.EXACT_OUTPUT) {
    hopsList = hopsList.map((hops) => [...hops].reverse())
  }

  invariant(hopsList.length === trade.swaps.length, 'INVALID_HOPS_LIST_LENGTH')

  const pricesAndWeights = trade.swaps.map((swap, i) => {
    const price = getRouteMarginalPrice(swap.route, hopsList[i])
    const percent = swap.inputAmount.divide(trade.inputAmount).asFraction
    return { price, percent }
  })
  const price = computeAveragePrice(pricesAndWeights)

  return new Price(trade.inputCurrency, trade.outputCurrency, price.denominator, price.numerator)
}

/**
 * Calculate the marginal swap price of a route
 * @param route Route of the swap
 * @param hops  Simulated hops from quoter contract
 * @returns     Marginal swap price of the route
 */
export function getRouteMarginalPrice<TInput extends Currency, TOutput extends Currency>(
  route: Route<TInput, TOutput>,
  hops: Hop[]
): Price<TInput, TOutput> {
  invariant(hops.length === route.pools.length, 'INVALID_HOPS_LENGTH')

  let input = route.input.wrapped
  let price: Price<Token, Token> | undefined

  for (const [j, pool] of route.pools.entries()) {
    invariant(hops[j].tierAmountsIn.length <= pool.tiers.length, 'INVALID_AMOUNTS_IN_LENGTH')

    const token0In = pool.token0.equals(input)
    const pricesAndWeights = getInputAmountDistribution(hops[j]).map((percent, tierId) => {
      const tier = pool.tiers[tierId]
      const tierPrice = token0In ? tier.token0Price : tier.token1Price
      return { price: tierPrice, percent }
    })
    const avgPrice = computeAveragePrice(pricesAndWeights)

    price = price == null ? avgPrice : price.multiply(avgPrice)
    input = token0In ? pool.token1 : pool.token0
  }

  if (price == null) {
    return new Price(route.input, route.output, 1, 0) // return zero price if route is empty
  }

  // safety check
  invariant(price.baseCurrency.equals(route.input.wrapped), 'UNMATCHED_BASE')
  invariant(price.quoteCurrency.equals(route.output.wrapped), 'UNMATCHED_QUOTE')

  return new Price(route.input, route.output, price.denominator, price.numerator)
}

/**
 * @param pricesAndWeights Array of { price, percent }. Percent represent the weight of the price
 * @returns Weighted average price
 */
export const computeAveragePrice = <TBase extends Currency, TQuote extends Currency>(
  pricesAndWeights: {
    price: Price<TBase, TQuote>
    percent: Fraction
  }[]
) => {
  invariant(pricesAndWeights.length > 0, 'INVALID_ARGS_COMPUTING_AVG_PRICE')

  const base = pricesAndWeights[0].price.baseCurrency
  const quote = pricesAndWeights[0].price.quoteCurrency

  let z = new Fraction(0)
  for (const { price, percent } of pricesAndWeights) {
    invariant(price.baseCurrency.equals(base), 'AVG_PRICE__UNMATCHED_BASE')
    invariant(price.quoteCurrency.equals(quote), 'AVG_PRICE__UNMATCHED_QUOTE')
    z = z.add(price.asFraction.multiply(percent))
  }

  return new Price(base, quote, z.denominator, z.numerator)
}
