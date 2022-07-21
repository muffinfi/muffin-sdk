import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core'
import { ALL_TIERS, MAX_TICK, MIN_TICK, Q72 } from '../constants'
import { Pool } from '../entities/pool'
import { Route } from '../entities/route'
import { Trade } from '../entities/trade'
import { getRealizedFee } from './getRealizedFee'

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

describe('getRealizedFee', () => {
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

  const pool01 = Pool.fromChainData(token0, token1, 1, [{ ...defaultTierData, sqrtGamma: 100000 }, defaultTierData])

  const pool12 = Pool.fromChainData(token1, token2, 1, [{ ...defaultTierData, sqrtGamma: 100000 }, defaultTierData])

  const trade = Trade.createUncheckedTrade({
    tradeType: TradeType.EXACT_INPUT,
    route: new Route([pool01, pool12], [ALL_TIERS, ALL_TIERS], token0, token2),
    inputAmount: CurrencyAmount.fromRawAmount(token0, 100000),
    outputAmount: CurrencyAmount.fromRawAmount(token2, 100000),
  })

  it('no fee', () => {
    const { percent, amount } = getRealizedFee(trade, [
      [{ tierAmountsIn: ['100000', '0'] }, { tierAmountsIn: ['100000', '0'] }],
    ])
    expect(percent.toFixed(4)).toEqual('0.0000')
    expect(amount.quotient.toString()).toEqual('0')
  })

  it('has fee', () => {
    const { percent, amount } = getRealizedFee(trade, [
      [{ tierAmountsIn: ['50000', '50000'] }, { tierAmountsIn: ['100000', '0'] }],
    ])
    expect(percent.toFixed(4)).toEqual('0.1499')
    expect(amount.quotient.toString()).toEqual('149')
  })
})
