import { Currency, Fraction, Percent, Price, Token, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { Trade } from '../entities/trade'
import { getAmountInDistribution, Hop } from './getPriceImpact'

export function getTradeMarginalPrice<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hopsList: Hop[][]
): Price<TInput, TOutput> {
  invariant(hopsList.length === trade.swaps.length, 'INVALID_HOPS_LIST_LENGTH')

  // reverse hops direction if exact output
  if (trade.tradeType === TradeType.EXACT_OUTPUT) {
    hopsList = hopsList.map((hops) => [...hops].reverse())
  }

  // compute price and weight per swap route
  const pricesAndWeights = trade.swaps.map((swap, i) => {
    const hops = hopsList[i]
    invariant(hops.length === swap.route.pools.length, 'INVALID_HOPS_LENGTH')

    let input = swap.route.input.wrapped
    let price: Price<Token, Token> | undefined

    for (const [j, pool] of swap.route.pools.entries()) {
      const hop = hops[j]
      const token0In = pool.token0.equals(input)

      // compute price and weight per tier in a hop
      const amtInPercents = getAmountInDistribution(hop, pool)
      const _pricesAndWeights = amtInPercents.map((percent, tierId) => {
        const tier = pool.tiers[tierId]
        const tierPrice = token0In ? tier.token0Price : tier.token1Price
        return { price: tierPrice, percent }
      })

      const avgPrice = computeAveragePrice(_pricesAndWeights)

      price = price == null ? avgPrice : price.multiply(avgPrice)
      input = pool.token0.equals(input) ? pool.token1 : pool.token0
    }

    if (price == null) {
      price = new Price(swap.route.input.wrapped, swap.route.output.wrapped, 0, 0)
    }

    const amtInFraction = swap.inputAmount.divide(trade.inputAmount)
    const amtInPercent = new Percent(amtInFraction.numerator, amtInFraction.denominator)

    return { price, percent: amtInPercent }
  })

  const avgPrice = computeAveragePrice(pricesAndWeights)

  // safety check
  invariant(
    avgPrice.baseCurrency.equals(trade.inputCurrency.wrapped) &&
      avgPrice.quoteCurrency.equals(trade.outputCurrency.wrapped),
    'UNMATCHED_CURRENCIES'
  )

  return new Price(trade.inputCurrency, trade.outputCurrency, avgPrice.denominator, avgPrice.numerator)
}

export const computeAveragePrice = <TBase extends Token, TQuote extends Token>(
  xs: { price: Price<TBase, TQuote>; percent: Percent }[]
) => {
  invariant(xs.length > 0, 'INVALID_ARGS_COMPUTING_AVG_PRICE')

  const base = xs[0].price.baseCurrency
  const quote = xs[0].price.quoteCurrency

  let z = new Fraction(0)
  for (const { price, percent } of xs) {
    invariant(price.baseCurrency.equals(base), 'AVG_PRICE__UNMATCHED_BASE')
    invariant(price.quoteCurrency.equals(quote), 'AVG_PRICE__UNMATCHED_QUOTE')

    z = z.add(price.asFraction.multiply(percent))
  }

  return new Price(base, quote, z.denominator, z.numerator)
}
