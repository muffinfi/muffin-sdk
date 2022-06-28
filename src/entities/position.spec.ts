import { Percent, Token } from '@uniswap/sdk-core'
import JSBI from 'JSBI'
import { LimitOrderType, MAX_TICK, MIN_TICK, Q72, ZERO } from '../constants'
import { Pool } from './pool'
import { Position } from './position'
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

const E = (x: number) => JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(x))

const E18 = E(18)

const isZeroOrOne = (x: JSBI) => JSBI.EQ(x, 0) || JSBI.EQ(x, 1)

const closeTo = (x: JSBI, y: JSBI, maxRelDiff = 0.01): boolean => {
  const factorX32 = JSBI.BigInt(Math.round((1 + maxRelDiff) * 2 ** 32))
  return JSBI.GT(x, y)
    ? JSBI.LE(JSBI.leftShift(x, JSBI.BigInt(32)), JSBI.multiply(y, factorX32))
    : JSBI.LE(JSBI.leftShift(y, JSBI.BigInt(32)), JSBI.multiply(x, factorX32))
}

describe('Position', () => {
  const token0 = makeToken({ sortOrder: 0 })
  const token1 = makeToken({ sortOrder: 1 })

  const tier0 = new Tier(token0, token1, '1', Q72, 100_000, MIN_TICK, MAX_TICK)
  const tier1 = new Tier(token0, token1, '1', JSBI.leftShift(Q72, JSBI.BigInt(8)), 100_000, MIN_TICK, MAX_TICK)
  const pool = new Pool(token0, token1, 1, [tier0, tier1])

  const positionArgs = {
    pool,
    tierId: 0,
    tickLower: -1,
    tickUpper: 2,
    liquidityD8: E18,
  }
  const position = new Position(positionArgs)

  it('amounts', () => {
    // test amounts non-zero (since in-range()
    expect(JSBI.GT(position.amount0.quotient, 0)).toEqual(true)
    expect(JSBI.GT(position.amount1.quotient, 0)).toEqual(true)

    // test amount0 > amount1, since tier price skew towards upper price boundary
    expect(JSBI.GT(position.amount0.quotient, position.amount1.quotient)).toEqual(true)
  })

  it('burnAmountsWithSlippage', () => {
    // test amounts are smaller after slippage
    const amts = position.burnAmountsWithSlippage(new Percent(5, 100_000)) // 0.00005 or 0.5 bps
    expect(JSBI.LT(amts.amount0, position.amount0.quotient)).toEqual(true)
    expect(JSBI.LT(amts.amount1, position.amount1.quotient)).toEqual(true)
  })

  it('burnAmountsWithSlippage (big slippage)', () => {
    // test amounts are zero after big slippage (relative to price range)
    const amts = position.burnAmountsWithSlippage(new Percent(1, 100)) // 1%
    expect(amts.amount0).toEqual(ZERO)
    expect(amts.amount1).toEqual(ZERO)
  })

  it('mintAmounts', () => {
    // test mint amounts == holding amounts rounded up
    expect(isZeroOrOne(JSBI.subtract(position.mintAmounts.amount0, position.amount0.quotient))).toEqual(true)
    expect(isZeroOrOne(JSBI.subtract(position.mintAmounts.amount1, position.amount1.quotient))).toEqual(true)

    // test amount0 > amount1, since tier price skew towards upper price boundary
    expect(JSBI.GT(position.mintAmounts.amount0, position.mintAmounts.amount1)).toEqual(true)
  })

  it('mintAmountsWithSlippage', () => {
    // test amounts are larger after slippage
    const amts = position.mintAmountsWithSlippage(new Percent(1, 100)) // 1%
    expect(JSBI.GT(amts.amount0, position.mintAmounts.amount0)).toEqual(true)
    expect(JSBI.GT(amts.amount1, position.mintAmounts.amount1)).toEqual(true)
  })

  it('settleAmounts (0 -> 1)', () => {
    const pos = new Position({ ...positionArgs, limitOrderType: LimitOrderType.ZeroForOne })

    // test single-sided output
    expect(pos.settleAmounts.amount0).toEqual(ZERO)
    expect(JSBI.GT(pos.settleAmounts.amount1, 0)).toEqual(true)
  })

  it('settleAmounts (1 -> 0)', () => {
    const pos = new Position({ ...positionArgs, limitOrderType: LimitOrderType.OneForZero })

    // test single-sided output
    expect(pos.settleAmounts.amount1).toEqual(ZERO)
    expect(JSBI.GT(pos.settleAmounts.amount0, 0)).toEqual(true)
  })

  it('amounts when settled (0 -> 1)', () => {
    const pos = new Position({ ...positionArgs, limitOrderType: LimitOrderType.ZeroForOne, settled: true })

    // test equals to settleAmount
    expect(pos.amount0.quotient).toEqual(ZERO)
    expect(JSBI.EQ(pos.amount1.quotient, pos.settleAmounts.amount1)).toEqual(true)
  })

  it('amounts when settled (1 -> 0)', () => {
    const pos = new Position({ ...positionArgs, limitOrderType: LimitOrderType.OneForZero, settled: true })

    // test equals to settleAmount
    expect(pos.amount1.quotient).toEqual(ZERO)
    expect(JSBI.EQ(pos.amount0.quotient, pos.settleAmounts.amount0)).toEqual(true)
  })

  it('amountsAtPrice', () => {
    const amts = position.amountsAtPrice(position.poolTier.sqrtPriceX72)
    expect(amts.amount0).toEqual(position.amount0.quotient)
    expect(amts.amount1).toEqual(position.amount1.quotient)
  })

  it('mintAmountsAtPrice', () => {
    const amts = position.mintAmountsAtPrice(position.poolTier.sqrtPriceX72)
    expect(amts.amount0).toEqual(position.mintAmounts.amount0)
    expect(amts.amount1).toEqual(position.mintAmounts.amount1)
  })

  const fromAmountArgs = {
    pool: position.pool,
    tierId: position.tierId,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
  }

  describe('fromAmounts', () => {
    const args = {
      ...fromAmountArgs,
      amount0: position.amount0.quotient,
      amount1: position.amount1.quotient,
    }

    it('non-zero amounts', () => {
      const pos = Position.fromAmounts(args)

      // test computed liquidity slightly lower than actual
      expect(JSBI.LT(pos.liquidityD8, position.liquidityD8)).toEqual(true)
      expect(closeTo(pos.liquidityD8, position.liquidityD8)).toEqual(true)
    })

    it('zero amount{0,1}', () => {
      expect(Position.fromAmounts({ ...args, amount0: ZERO }).liquidityD8).toEqual(ZERO)
      expect(Position.fromAmounts({ ...args, amount1: ZERO }).liquidityD8).toEqual(ZERO)
    })
  })

  it('fromAmount0', () => {
    const pos = Position.fromAmount0({ ...fromAmountArgs, amount0: position.amount0.quotient })

    // test computed liquidity slightly lower than actual
    expect(JSBI.LT(pos.liquidityD8, position.liquidityD8)).toEqual(true)
    expect(closeTo(pos.liquidityD8, position.liquidityD8)).toEqual(true)
  })

  it('fromAmount1', () => {
    const pos = Position.fromAmount1({ ...fromAmountArgs, amount1: position.amount1.quotient })

    // test computed liquidity slightly lower than actual
    expect(JSBI.LT(pos.liquidityD8, position.liquidityD8)).toEqual(true)
    expect(closeTo(pos.liquidityD8, position.liquidityD8)).toEqual(true)
  })
})
