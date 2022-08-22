import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { ALL_TIERS, MAX_TICK, MIN_TICK, Q72 } from '../../constants'
import { Pool } from '../../entities/pool'
import { Route } from '../../entities/route'
import { Trade } from '../../entities/trade'
import { getPriceImpact } from './getPriceImpact'

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

describe('getPriceImpact', () => {
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

  const pool01 = Pool.fromChainData(token0, token1, 1, [defaultTierData])

  const pool12 = Pool.fromChainData(token1, token2, 1, [
    defaultTierData,
    { ...defaultTierData, sqrtPrice: JSBI.multiply(Q72, JSBI.BigInt(2)) },
  ])

  const trade = Trade.createUncheckedTrade({
    tradeType: TradeType.EXACT_INPUT,
    route: new Route([pool01, pool12], [ALL_TIERS, ALL_TIERS], token0, token2),
    inputAmount: CurrencyAmount.fromRawAmount(token0, 100),
    outputAmount: CurrencyAmount.fromRawAmount(token2, 100),
  })

  it('no price impact', () => {
    const impact = getPriceImpact(trade, [[{ tierAmountsIn: ['100'] }, { tierAmountsIn: ['100', '0'] }]])
    expect(impact.equalTo(new Percent(0, 100))).toEqual(true)
  })

  it('has price impact', () => {
    const impact = getPriceImpact(trade, [[{ tierAmountsIn: ['100'] }, { tierAmountsIn: ['0', '100'] }]])
    expect(impact.equalTo(new Percent(75, 100))).toEqual(true)
  })
})
