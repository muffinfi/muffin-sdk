import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core'
import JSBI from 'JSBI'
import { MAX_TICK, MIN_TICK, Q72 } from '../constants'
import { Pool } from './pool'
import { Route } from './route'
import { Tier } from './tier'
import { Trade } from './trade'

function makeToken({
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

const E = (x: number) => JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(x))
const E18 = E(18)

describe('Trade', () => {
  const token0 = makeToken({ sortOrder: 0 })
  const token1 = makeToken({ sortOrder: 1 })
  const token2 = makeToken({ sortOrder: 2 })

  const pool01 = new Pool(token0, token1, 1, [
    new Tier(token0, token1, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token0, token1, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const pool12 = new Pool(token1, token2, 1, [
    new Tier(token1, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token1, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const pool02 = new Pool(token0, token2, 1, [
    new Tier(token0, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token0, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const tokenAmt = (token: Token, rawAmount: JSBI = E18) => CurrencyAmount.fromRawAmount(token, rawAmount)

  const routeArgs = {
    inputAmount: tokenAmt(token0),
    outputAmount: tokenAmt(token2),
  }

  it('works', () => {
    new Trade({
      tradeType: TradeType.EXACT_INPUT,
      routes: [
        { ...routeArgs, route: new Route([pool01, pool12], [0b11, 0b11], token0, token2) },
        { ...routeArgs, route: new Route([pool02], [0b11], token0, token2) },
      ],
    })
  })

  it('unmatched inputs', () => {
    expect(() => {
      new Trade({
        tradeType: TradeType.EXACT_INPUT,
        routes: [
          { ...routeArgs, inputAmount: tokenAmt(token1), route: new Route([pool12], [0b11], token1, token2) },
          { ...routeArgs, inputAmount: tokenAmt(token0), route: new Route([pool02], [0b11], token0, token2) },
        ],
      })
    }).toThrow('INPUT_CURRENCY_MATCH')
  })

  it('unmatched outputs', () => {
    expect(() => {
      new Trade({
        tradeType: TradeType.EXACT_INPUT,
        routes: [
          { ...routeArgs, outputAmount: tokenAmt(token1), route: new Route([pool01], [0b11], token0, token1) },
          { ...routeArgs, outputAmount: tokenAmt(token2), route: new Route([pool02], [0b11], token0, token2) },
        ],
      })
    }).toThrow('OUTPUT_CURRENCY_MATCH')
  })

  it('repeated pool', () => {
    expect(() => {
      new Trade({
        tradeType: TradeType.EXACT_INPUT,
        routes: [
          { ...routeArgs, route: new Route([pool02], [0b11], token0, token2) },
          { ...routeArgs, route: new Route([pool02], [0b11], token0, token2) },
        ],
      })
    }).toThrow('POOLS_DUPLICATED')
  })
})
