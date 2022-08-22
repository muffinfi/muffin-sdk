import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { Route } from '../../entities/route'
import { Trade } from '../../entities/trade'
import { getInputAmountDistribution, Hop } from './getInputAmountDistribution'

/**
 * Calculate output amount using the marginal prices of the pools. Swap fee not taken into account.
 * @param trade Trade instance
 * @param hopsList List of simulated hops from quoter contract
 * @returns Marginal output amount
 */
export function getTradeMaringalOutputAmount<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hopsList: Hop[][]
): CurrencyAmount<TOutput> {
  // reverse hops direction if exact output
  if (trade.tradeType === TradeType.EXACT_OUTPUT) {
    hopsList = hopsList.map((hops) => [...hops].reverse())
  }

  invariant(hopsList.length === trade.swaps.length, 'INVALID_HOPS_LIST_LENGTH')

  let amount = CurrencyAmount.fromRawAmount(trade.outputAmount.currency, 0)
  for (const [i, swap] of trade.swaps.entries()) {
    amount = amount.add(getRouteMarginalOutputAmount(swap.route, swap.inputAmount, hopsList[i]))
  }
  return amount
}

/**
 * Calculate output amount using the marginal prices of the pools. Swap fee not taken into account.
 * @param route Route of the swap
 * @param amountIn Input amount
 * @param hops Simulated hops from quoter contract
 * @returns Marginal output amount
 */
export function getRouteMarginalOutputAmount<TInput extends Currency, TOutput extends Currency>(
  route: Route<TInput, TOutput>,
  amountIn: CurrencyAmount<TInput>,
  hops: Hop[]
): CurrencyAmount<TOutput> {
  invariant(hops.length === route.pools.length, 'INVALID_HOPS_LENGTH')
  invariant(route.pools[0].involvesToken(amountIn.currency.wrapped), 'INPUT_TOKEN')

  let inputAmount = amountIn.wrapped
  let input = inputAmount.currency

  for (const [i, pool] of route.pools.entries()) {
    invariant(hops[i].tierAmountsIn.length <= pool.tiers.length, 'INVALID_AMOUNTS_IN_LENGTH')

    const output = input.equals(pool.token0) ? pool.token1 : pool.token0
    let spotOutputAmount = CurrencyAmount.fromRawAmount(output, 0)

    for (const [tierId, percent] of getInputAmountDistribution(hops[i]).entries()) {
      const tierAmtIn = inputAmount.multiply(percent)
      const tier = pool.tiers[tierId]
      const price = input.equals(pool.token0) ? tier.token0Price : tier.token1Price
      spotOutputAmount = spotOutputAmount.add(price.quote(tierAmtIn))
    }

    input = output
    inputAmount = spotOutputAmount
  }

  return CurrencyAmount.fromFractionalAmount(route.output, inputAmount.numerator, inputAmount.denominator)
}

/**
 * Calculate "price impact" using marginal output amount and trade's output amount.
 * It actually means how much the marginal output amount is larger than actual output amount, represented in percentage.
 * In theory, the percentage must be non-negative.
 */
export function getPriceImpact<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hopsList: Hop[][]
): Percent {
  const marginalOutputAmount = getTradeMaringalOutputAmount(trade, hopsList)
  const priceImpact = marginalOutputAmount.subtract(trade.outputAmount).divide(marginalOutputAmount)
  return new Percent(priceImpact.numerator, priceImpact.denominator)
}
