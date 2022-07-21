import { Token } from '@uniswap/sdk-core'
import { MAX_TICK, ALL_TIERS, MIN_TICK, Q72 } from '../constants'
import { Pool } from './pool'
import { Route } from './route'
import { Tier } from './tier'

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

describe('Route', () => {
  const token0 = makeToken({ sortOrder: 0 })
  const token1 = makeToken({ sortOrder: 1 })
  const token2 = makeToken({ sortOrder: 2 })
  const token3 = makeToken({ sortOrder: 3 })

  const pool01 = new Pool(token0, token1, 1, [
    new Tier(token0, token1, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token0, token1, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const pool12 = new Pool(token1, token2, 1, [
    new Tier(token1, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token1, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const pool23 = new Pool(token2, token3, 1, [
    new Tier(token2, token3, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token2, token3, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  const pool02 = new Pool(token0, token2, 1, [
    new Tier(token0, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
    new Tier(token0, token2, '1', Q72, 100_000, MIN_TICK, MAX_TICK),
  ])

  it('works', () => {
    new Route([pool01, pool12, pool23], [0b1, 0b1, 0b1], token0, token3)
    new Route([pool23, pool12, pool01], [0b1, 0b1, 0b1], token3, token0)
  })

  it('wrong path', () => {
    expect(() => new Route([pool01, pool23], [0b1, 0b1], token0, token3)).toThrow('PATH')
    expect(() => new Route([pool01, pool02, pool23], [0b1, 0b1, 0b1], token0, token3)).toThrow('PATH')
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b1, 0b1], token1, token3)).toThrow('PATH')
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b1, 0b1], token0, token2)).toThrow('PATH')
  })

  it('input not in first pool', () => {
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b1, 0b1], token2, token3)).toThrow('INPUT')
  })

  it('output not in last pool', () => {
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b1, 0b1], token0, token1)).toThrow('OUTPUT')
  })

  it('empty tier choices', () => {
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b0, 0b1], token0, token3)).toThrow('TIER_CHOICES')
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b100, 0b1], token0, token3)).toThrow('TIER_CHOICES')
    new Route([pool01, pool12, pool23], [0b1, 0b110, 0b1], token0, token3) // no throw
  })

  it('exceed max tier choices', () => {
    expect(() => new Route([pool01, pool12, pool23], [0b1, ALL_TIERS << 1, 0b1], token0, token3)).toThrow('TIER_CHOICES') // prettier-ignore
    new Route([pool01, pool12, pool23], [0b1, ALL_TIERS, 0b1], token0, token3) // no throw
  })

  it('unmatched pools and tierChoices length', () => {
    expect(() => new Route([pool01, pool12, pool23], [0b1, 0b1], token0, token3)).toThrow('TIER_CHOICES_COUNT')
  })
})
