import { CurrencyAmount, Fraction, Token, TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { MAX_TICK, MIN_TICK, Q72 } from '../constants'
import { Pool } from '../entities/pool'
import { Route } from '../entities/route'
import { Trade } from '../entities/trade'
import { getTradeMaringalOutputAmount } from './getPriceImpact'
import { getTradeMarginalPrice } from './getTradeMarginalPrice'

function token({
  sortOrder,
  decimals = 18,
  chainId = 1,
}: {
  sortOrder: number
  decimals?: number
  chainId?: number
}): Token {
  if (sortOrder > 9 || sortOrder % 1 !== 0) throw new Error('invalid sort order')
  return new Token(
    chainId,
    `0x${new Array<string>(40).fill(`${sortOrder}`).join('')}`,
    decimals,
    `T${sortOrder}`,
    `token${sortOrder}`
  )
}

describe('getTradeMarginalPrice', () => {
  const token0 = token({ sortOrder: 0 })
  const token1 = token({ sortOrder: 1 })
  const token2 = token({ sortOrder: 2 })

  const defaultTierData = {
    liquidity: '1',
    sqrtPrice: Q72,
    sqrtGamma: 99850,
    tick: 0,
    nextTickBelow: MIN_TICK,
    nextTickAbove: MAX_TICK,
    feeGrowthGlobal0: '0',
    feeGrowthGlobal1: '0',
  }

  const pool01 = Pool.fromChainData(token0, token1, 1, [
    { ...defaultTierData, sqrtPrice: JSBI.multiply(Q72, JSBI.BigInt(2)) },
    { ...defaultTierData, sqrtPrice: Q72 },
  ])

  const pool12 = Pool.fromChainData(token1, token2, 1, [
    { ...defaultTierData, sqrtPrice: JSBI.divide(Q72, JSBI.BigInt(2)) },
    { ...defaultTierData, sqrtPrice: Q72 },
  ])

  const pool02 = Pool.fromChainData(token0, token2, 1, [
    { ...defaultTierData, sqrtPrice: Q72 },
    { ...defaultTierData, sqrtPrice: Q72 },
  ])

  const routes = [
    {
      route: new Route([pool01, pool12], [0b111111, 0b111111], token0, token2),
      inputAmount: CurrencyAmount.fromRawAmount(token0, 100000),
      outputAmount: CurrencyAmount.fromRawAmount(token2, 100000),
    },
    {
      route: new Route([pool02], [0b111111], token0, token2),
      inputAmount: CurrencyAmount.fromRawAmount(token0, 50000),
      outputAmount: CurrencyAmount.fromRawAmount(token2, 50000),
    },
  ]

  it('exact in', () => {
    const trade = new Trade({ tradeType: TradeType.EXACT_INPUT, routes })
    const hopsList = [
      [{ tierAmountsIn: [75000, 25000] }, { tierAmountsIn: [1, 1] }], // the amount need not to be correct. we need the proportion only
      [{ tierAmountsIn: [30000, 20000] }],
    ]

    const price = getTradeMarginalPrice(trade, hopsList)
    const control = trade.swaps
      .map((swap) => Number(swap.inputAmount.toSignificant(10))) // get input amount per swap
      .map((amt, _, arr) => amt / arr.reduce(sum)) // to percent
      .map((pct, j) => {
        const route = trade.swaps[j].route
        const priceOfSwap = hopsList[j]
          .map((hop, i) =>
            hop.tierAmountsIn
              .map((amt, _, arr) => amt / arr.reduce(sum)) // to percent
              .map((pct, tierId) => priceToNumer(route.pools[i].tiers[tierId].token0Price) * pct) // to price * percent
              .reduce(sum)
          )
          .reduce(product)
        return priceOfSwap * pct
      })
      .reduce(sum)
    // console.log(price.baseCurrency.symbol, price.quoteCurrency.symbol, price.toFixed(5), control)

    expect(priceToNumer(price)).toBeCloseTo(control)

    const amtOut = getTradeMaringalOutputAmount(trade, hopsList)
    const price2 = amtOut.divide(trade.inputAmount).asFraction
    expect(priceToNumer(price)).toBeCloseTo(priceToNumer(price2))
  })

  it('exact out', () => {
    const priceExactOut = getTradeMarginalPrice(new Trade({ tradeType: TradeType.EXACT_OUTPUT, routes }), [
      [{ tierAmountsIn: [75000, 25000] }, { tierAmountsIn: [1, 1] }],
      [{ tierAmountsIn: [30000, 20000] }],
    ])
    const priceExactIn = getTradeMarginalPrice(new Trade({ tradeType: TradeType.EXACT_INPUT, routes }), [
      [{ tierAmountsIn: [1, 1] }, { tierAmountsIn: [75000, 25000] }],
      [{ tierAmountsIn: [30000, 20000] }],
    ])
    expect(priceExactOut).toEqual(priceExactIn)
  })
})

const priceToNumer = (price: Fraction) => Number(price.toSignificant(10))
const sum = (acc: number, x: number) => acc + x
const product = (acc: number, x: number) => acc * x
