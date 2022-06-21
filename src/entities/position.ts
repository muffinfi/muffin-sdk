import { BigintIsh, CurrencyAmount, Percent, Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { LimitOrderType, MaxUint256, MAX_TICK, MIN_TICK, ZERO } from '../constants'
import { tickToPrice } from '../utils/misc'
import { PoolMath } from '../utils/poolMath'
import { TickMath } from '../utils/tickMath'
import { Pool } from './pool'
import { Tier } from './tier'

type FromAmountsArgs = {
  pool: Pool
  tierId: number
  tickLower: number
  tickUpper: number
  amount0: BigintIsh
  amount1: BigintIsh
  limitOrderType?: LimitOrderType
  settled?: boolean
}
type FromAmount0Args = Omit<FromAmountsArgs, 'amount1'>
type FromAmount1Args = Omit<FromAmountsArgs, 'amount0'>

export class Position {
  public readonly pool: Pool
  public readonly tierId: number
  public readonly tickLower: number
  public readonly tickUpper: number
  public readonly liquidityD8: JSBI
  public readonly limitOrderType: LimitOrderType = LimitOrderType.NotLimitOrder
  public readonly settlementSnapshotId: JSBI = ZERO
  public readonly settled: boolean = false

  private _token0Amount?: CurrencyAmount<Token> // cache
  private _token1Amount?: CurrencyAmount<Token> // cache
  private _mintAmounts?: { amount0: JSBI; amount1: JSBI } // cache
  private _settleAmounts?: { amount0?: JSBI; amount1?: JSBI } // cache

  public constructor({
    pool,
    tierId,
    tickLower,
    tickUpper,
    liquidityD8,
    limitOrderType,
    settlementSnapshotId,
    settled,
  }: {
    pool: Pool
    tierId: number
    tickLower: number
    tickUpper: number
    liquidityD8: BigintIsh
    limitOrderType?: number
    settlementSnapshotId?: BigintIsh
    settled?: boolean
  }) {
    invariant(tickLower < tickUpper, 'TICK_ORDER')
    invariant(tickLower >= MIN_TICK && tickLower % pool.tickSpacing === 0, 'TICK_LOWER')
    invariant(tickUpper <= MAX_TICK && tickUpper % pool.tickSpacing === 0, 'TICK_UPPER')
    invariant(tierId < pool.tiers.length, 'TIER_ID')
    invariant(limitOrderType == null || limitOrderType in LimitOrderType, 'LIMIT_ORDER_TYPE')
    invariant(
      !settled || (limitOrderType != null && limitOrderType !== LimitOrderType.NotLimitOrder),
      'LIMIT_ORDER_TYPE'
    )

    this.pool = pool
    this.tierId = tierId
    this.tickLower = tickLower
    this.tickUpper = tickUpper
    this.liquidityD8 = JSBI.BigInt(liquidityD8)

    if (limitOrderType != null) this.limitOrderType = limitOrderType
    if (settlementSnapshotId != null) this.settlementSnapshotId = JSBI.BigInt(settlementSnapshotId)
    if (settled != null) this.settled = settled
  }

  public static fromAmounts({
    pool,
    tierId,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    ...rest
  }: FromAmountsArgs): Position {
    const sqrtPLower = TickMath.tickToSqrtPriceX72(tickLower)
    const sqrtPUpper = TickMath.tickToSqrtPriceX72(tickUpper)
    const liquidityD8 = PoolMath.maxOutputLiquidityD8ForAmounts(
      pool.tiers[tierId].sqrtPriceX72,
      sqrtPLower,
      sqrtPUpper,
      JSBI.BigInt(amount0),
      JSBI.BigInt(amount1)
    )
    return new Position({ pool, tierId, tickLower, tickUpper, liquidityD8, ...rest })
  }

  public static fromAmount0(args: FromAmount0Args): Position {
    return this.fromAmounts({ ...args, amount1: MaxUint256 })
  }

  public static fromAmount1(args: FromAmount1Args): Position {
    return this.fromAmounts({ ...args, amount0: MaxUint256 })
  }

  public static fromLimitOrderExactOutput({
    tickLower,
    tickUpper,
    amount0,
    amount1,
    limitOrderType,
    ...rest
  }: FromAmountsArgs): Position {
    invariant(
      limitOrderType === LimitOrderType.ZeroForOne || limitOrderType === LimitOrderType.OneForZero,
      'LIMIT_ORDER_TYPE'
    )

    const sqrtPLower = TickMath.tickToSqrtPriceX72(tickLower)
    const sqrtPUpper = TickMath.tickToSqrtPriceX72(tickUpper)
    const sqrtPriceX72 = limitOrderType === LimitOrderType.ZeroForOne ? sqrtPUpper : sqrtPLower
    const liquidityD8 = PoolMath.maxOutputLiquidityD8ForAmounts(
      sqrtPriceX72,
      sqrtPLower,
      sqrtPUpper,
      JSBI.BigInt(amount0),
      JSBI.BigInt(amount1)
    )
    return new Position({ tickLower, tickUpper, liquidityD8, limitOrderType, ...rest })
  }

  public get poolTier(): Tier {
    invariant(this.tierId < this.pool.tiers.length, 'TIER_ID')
    return this.pool.tiers[this.tierId]
  }

  public get liquidity(): JSBI {
    return JSBI.multiply(this.liquidityD8, JSBI.BigInt(256))
  }

  // Returns the price of token0 at the lower tick
  public get token0PriceLower(): Price<Token, Token> {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickLower)
  }

  // Returns the price of token0 at the upper tick
  public get token0PriceUpper(): Price<Token, Token> {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickUpper)
  }

  // Returns the amount of underlying token0 in this position
  public get amount0(): CurrencyAmount<Token> {
    if (this._token0Amount == null) {
      const { sqrtPUpper, sqrtPExit } = this._calculateSqrtPrices()
      const amount0 = PoolMath.getAmount0Delta(sqrtPExit, sqrtPUpper, this.liquidity, false)
      this._token0Amount = CurrencyAmount.fromRawAmount(this.pool.token0, amount0)
    }
    return this._token0Amount
  }

  // Returns the amount of underlying token0 in this position
  public get amount1(): CurrencyAmount<Token> {
    if (this._token1Amount == null) {
      const { sqrtPLower, sqrtPExit } = this._calculateSqrtPrices()
      const amount1 = PoolMath.getAmount1Delta(sqrtPExit, sqrtPLower, this.liquidity, false)
      this._token1Amount = CurrencyAmount.fromRawAmount(this.pool.token1, amount1)
    }
    return this._token1Amount
  }

  private _calculateSqrtPrices() {
    const sqrtPLower = TickMath.tickToSqrtPriceX72(this.tickLower)
    const sqrtPUpper = TickMath.tickToSqrtPriceX72(this.tickUpper)

    let sqrtPExit: JSBI
    if (this.settled) {
      sqrtPExit = this.limitOrderType === LimitOrderType.ZeroForOne ? sqrtPUpper : sqrtPLower
    } else {
      const sqrtPCurrent = this.poolTier.sqrtPriceX72
      if (JSBI.lessThan(sqrtPCurrent, sqrtPLower)) {
        sqrtPExit = sqrtPLower
      } else if (JSBI.greaterThan(sqrtPCurrent, sqrtPUpper)) {
        sqrtPExit = sqrtPUpper
      } else {
        sqrtPExit = sqrtPCurrent
      }
    }
    return { sqrtPLower, sqrtPUpper, sqrtPExit }
  }

  // Returns the holding amounts of tokens at input price with the amount of liquidity of this position
  public amountsAtPrice(sqrtPriceX72: JSBI, roundUp: boolean): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    return PoolMath.amountsForLiquidityD8(
      sqrtPriceX72,
      TickMath.tickToSqrtPriceX72(this.tickLower),
      TickMath.tickToSqrtPriceX72(this.tickUpper),
      this.liquidityD8,
      roundUp
    )
  }

  // Returns the minimum input amounts required to mint the amount of liquidity of this position at current price
  public get mintAmounts(): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    if (this._mintAmounts == null) {
      this._mintAmounts = this.amountsAtPrice(this.poolTier.sqrtPriceX72, true)
    }
    return this._mintAmounts
  }

  // Returns the settle amounts can be collected when reached the specified price
  public get settleAmounts(): Readonly<{ amount0?: JSBI; amount1?: JSBI }> {
    if (this._settleAmounts == null) {
      if (this.limitOrderType !== LimitOrderType.ZeroForOne && this.limitOrderType !== LimitOrderType.OneForZero) {
        this._settleAmounts = {}
      } else {
        this._settleAmounts = this.amountsAtPrice(
          this.limitOrderType === LimitOrderType.ZeroForOne
            ? TickMath.tickToSqrtPriceX72(this.tickUpper)
            : TickMath.tickToSqrtPriceX72(this.tickLower),
          false
        )
      }
    }
    return this._settleAmounts
  }

  // Returns the minimum input amounts required to mint the amount of liquidity of this position with the given slippage tolerance
  public mintAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    const sqrtPLower = TickMath.tickToSqrtPriceX72(this.tickLower)
    const sqrtPUpper = TickMath.tickToSqrtPriceX72(this.tickUpper)

    // calculate minimum input amounts required to mint the liquidityD8 specified in this position
    const { amount0: _amount0, amount1: _amount1 } = this.mintAmounts

    // calculate actual liquidityD8 to be received from the minimum input amounts
    const liquidityD8 = PoolMath.maxOutputLiquidityD8ForAmounts(this.poolTier.sqrtPriceX72, sqrtPLower, sqrtPUpper, _amount0, _amount1) // prettier-ignore

    // calculate the most tolerated tier current sqrt prices with slippage
    const { sqrtPriceSlippageLower, sqrtPriceSlippageUpper } = this.poolTier.sqrtPriceAfterSlippage(slippageTolerance)

    // calculate minimum input amounts required to mint the "actual liquidityD8" under the tolerated current tier price
    const { amount0 } = PoolMath.minInputAmountsForLiquidityD8(sqrtPriceSlippageUpper, sqrtPLower, sqrtPUpper, liquidityD8) // prettier-ignore
    const { amount1 } = PoolMath.minInputAmountsForLiquidityD8(sqrtPriceSlippageLower, sqrtPLower, sqrtPUpper, liquidityD8) // prettier-ignore
    return { amount0, amount1 }
  }

  // Returns the minimum output amounts expected from burning the liquidity of this position with the given slippage tolerance
  // (Note that this is not for settled position)
  public burnAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    const sqrtPLower = TickMath.tickToSqrtPriceX72(this.tickLower)
    const sqrtPUpper = TickMath.tickToSqrtPriceX72(this.tickUpper)

    // calculate the most tolerated tier current sqrt prices with slippage
    const { sqrtPriceSlippageLower, sqrtPriceSlippageUpper } = this.poolTier.sqrtPriceAfterSlippage(slippageTolerance)

    // calculate minimum output amounts from burning the liquidity under the tolerated current tier price
    const { amount0 } = PoolMath.minOutputAmountsForLiquidityD8(sqrtPriceSlippageUpper, sqrtPLower, sqrtPUpper, this.liquidityD8) // prettier-ignore
    const { amount1 } = PoolMath.minOutputAmountsForLiquidityD8(sqrtPriceSlippageLower, sqrtPLower, sqrtPUpper, this.liquidityD8) // prettier-ignore
    return { amount0, amount1 }
  }
}
