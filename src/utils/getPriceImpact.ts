import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ZERO } from '../constants'
import { Route } from '../entities/route'
import { Trade } from '../entities/trade'

interface BigNumberish {
  toString(): string
}

export interface Hop {
  tierAmountsIn: BigNumberish[]
}

export function getAmountInDistribution(hop: Hop): Percent[] {
  const tierAmtsIn = hop.tierAmountsIn.map(amtIn => JSBI.BigInt(amtIn.toString()))
  const sumAmtIn = tierAmtsIn.reduce((acc, amtIn) => JSBI.add(acc, amtIn), ZERO)
  return tierAmtsIn.map(amtIn => new Percent(amtIn, sumAmtIn))
}

export function getSpotOutputAmount<TInput extends Currency, TOutput extends Currency>(
  route: Route<TInput, TOutput>,
  amountIn: CurrencyAmount<TInput>,
  hops: Hop[]
): CurrencyAmount<TOutput> {
  invariant(hops.length === route.pools.length, 'INVALID_HOPS')
  invariant(route.pools[0].involvesToken(amountIn.currency.wrapped), 'INPUT_TOKEN')

  let inputAmount = amountIn.wrapped
  let input = inputAmount.currency

  for (const [i, pool] of route.pools.entries()) {
    const output = input.equals(pool.token0) ? pool.token1 : pool.token0
    let spotOutputAmount = CurrencyAmount.fromRawAmount(output, 0)

    for (const [tierId, percent] of getAmountInDistribution(hops[i]).entries()) {
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

export function getPriceImpact<TInput extends Currency, TOutput extends Currency>(
  trade: Trade<TInput, TOutput, TradeType>,
  hops: Hop[][]
): Percent {
  invariant(hops.length === trade.swaps.length, 'HOPS')

  let spotOutputAmount = CurrencyAmount.fromRawAmount(trade.outputAmount.currency, 0)
  for (const [i, { route, inputAmount }] of trade.swaps.entries()) {
    spotOutputAmount = spotOutputAmount.add(getSpotOutputAmount(route, inputAmount, hops[i]))
  }
  const priceImpact = spotOutputAmount.subtract(trade.outputAmount).divide(spotOutputAmount)
  return new Percent(priceImpact.numerator, priceImpact.denominator)
}
