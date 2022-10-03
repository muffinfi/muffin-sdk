import { BigintIsh, CurrencyAmount, Percent, Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { LimitOrderType, MaxUint256, MAX_TICK, MIN_TICK, Q144, ZERO } from '../constants'
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
  private _priceToSettle?: Price<Token, Token> // cache

  /**
   * Construct a position
   */
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
    invariant(tickLower >= MIN_TICK, 'TICK_LOWER_LIMIT')
    invariant(tickUpper <= MAX_TICK, 'TICK_UPPER_LIMIT')
    invariant(tierId < pool.tiers.length, 'TIER_ID')
    invariant(limitOrderType == null || limitOrderType in LimitOrderType, 'LIMIT_ORDER_TYPE')
    if (settled) {
      invariant(limitOrderType != null && limitOrderType !== LimitOrderType.NotLimitOrder, 'LIMIT_ORDER_TYPE')
    }

    this.pool = pool
    this.tierId = tierId
    this.tickLower = tickLower
    this.tickUpper = tickUpper
    this.liquidityD8 = JSBI.BigInt(liquidityD8)

    if (limitOrderType != null) this.limitOrderType = limitOrderType
    if (settlementSnapshotId != null) this.settlementSnapshotId = JSBI.BigInt(settlementSnapshotId)
    if (settled != null) this.settled = settled
  }

  /**
   * Compute the maximum amount of liquidity received for a given token0 amount, token1 amount, and tick range.
   */
  public static fromAmounts({
    pool,
    tierId,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    limitOrderType,
    settled,
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
    return new Position({ pool, tierId, tickLower, tickUpper, liquidityD8, limitOrderType, settled })
  }

  /**
   * Construct a position by computing the maximum amount of liquidity received for a given token0 amount,
   * assuming an unlimited amount of token1.
   */
  public static fromAmount0(args: FromAmount0Args): Position {
    return this.fromAmounts({ ...args, amount1: MaxUint256 })
  }

  /**
   * Construct a position by computing the maximum amount of liquidity received for a given token1 amount,
   * assuming an unlimited amount of token0.
   */
  public static fromAmount1(args: FromAmount1Args): Position {
    return this.fromAmounts({ ...args, amount0: MaxUint256 })
  }

  /**
   * Construct a limit-order position by computing the amount of liquidity required such that the position will
   * consist of the given amount of token0 or token1 when it is fully converted into single-sided.
   */
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

  /** Returns the tier where the position is in */
  public get poolTier(): Tier {
    invariant(this.tierId < this.pool.tiers.length, 'TIER_ID')
    return this.pool.tiers[this.tierId]
  }

  /** Returns the amount of liquidity of the position */
  public get liquidity(): JSBI {
    return JSBI.multiply(this.liquidityD8, JSBI.BigInt(256))
  }

  /** Returns the price of token0 denominated in token1 at the lower tick */
  public get token0PriceLower(): Price<Token, Token> {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickLower)
  }

  /** Returns the price of token0 denominated in token1 at the upper tick */
  public get token0PriceUpper(): Price<Token, Token> {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickUpper)
  }

  /** Sqrt price of the lower tick boundary */
  public get sqrtPriceLower(): JSBI {
    return TickMath.tickToSqrtPriceX72(this.tickLower)
  }

  /** Sqrt price of the upper tick boundary */
  public get sqrtPriceUpper(): JSBI {
    return TickMath.tickToSqrtPriceX72(this.tickUpper)
  }

  /** Returns true if this position is a limit order */
  public get isLimitOrder(): boolean {
    return this.limitOrderType === LimitOrderType.ZeroForOne || this.limitOrderType === LimitOrderType.OneForZero
  }

  /** Sqrt price which the position will be settled at */
  public get sqrtPriceSettle(): JSBI {
    invariant(this.isLimitOrder, 'SQRT_PRICE_TO_SETTLE')
    return this.limitOrderType === LimitOrderType.ZeroForOne ? this.sqrtPriceUpper : this.sqrtPriceLower
  }

  /** Returns the price of token0 denominated in token1 when the position is settled  */
  public get priceToSettle(): Price<Token, Token> {
    invariant(this.isLimitOrder, 'PRICE_TO_SETTLE')

    if (this._priceToSettle == null) {
      const sqrtPriceX72 = this.sqrtPriceSettle
      const priceX144 = JSBI.multiply(sqrtPriceX72, sqrtPriceX72)
      this._priceToSettle = new Price(this.pool.token0, this.pool.token1, Q144, priceX144)
    }
    return this._priceToSettle
  }

  /** Returns the amount of underlying token0 in this position */
  public get amount0(): CurrencyAmount<Token> {
    return this._computeTokenAmounts()[0]
  }

  /** Returns the amount of underlying token0 in this position */
  public get amount1(): CurrencyAmount<Token> {
    return this._computeTokenAmounts()[1]
  }

  private _computeTokenAmounts(): [CurrencyAmount<Token>, CurrencyAmount<Token>] {
    if (this._token0Amount == null || this._token1Amount == null) {
      const sqrtPLower = this.sqrtPriceLower
      const sqrtPUpper = this.sqrtPriceUpper

      const sqrtPCurrent = this.settled ? this.sqrtPriceSettle : this.poolTier.sqrtPriceX72

      const { amount0, amount1 } = PoolMath.amountsForLiquidityDeltaD8(
        sqrtPCurrent,
        sqrtPLower,
        sqrtPUpper,
        JSBI.multiply(this.liquidityD8, JSBI.BigInt(-1)) // simulate withdrawing liquidity
      )

      this._token0Amount = CurrencyAmount.fromRawAmount(this.pool.token0, amount0)
      this._token1Amount = CurrencyAmount.fromRawAmount(this.pool.token1, amount1)
    }
    return [this._token0Amount, this._token1Amount]
  }

  /**
   * Returns the amounts of underlying tokens at the given price with the amount of liquidity of this position
   */
  public amountsAtPrice(sqrtPriceX72: JSBI): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    return PoolMath.amountsForLiquidityDeltaD8(
      sqrtPriceX72,
      this.sqrtPriceLower,
      this.sqrtPriceUpper,
      JSBI.multiply(this.liquidityD8, JSBI.BigInt(-1)) // simulate withdrawing liquidity
    )
  }

  /**
   * Returns the minimum input amounts required to mint the amount of liquidity of this position if the tier is at the
   * given price.
   */
  public mintAmountsAtPrice(sqrtPriceX72: JSBI): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    return PoolMath.amountsForLiquidityDeltaD8(sqrtPriceX72, this.sqrtPriceLower, this.sqrtPriceUpper, this.liquidityD8)
  }

  /**
   * Returns the minimum input amounts required to mint the amount of liquidity of this position at the current price
   */
  public get mintAmounts(): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    if (this._mintAmounts == null) this._mintAmounts = this.mintAmountsAtPrice(this.poolTier.sqrtPriceX72)
    return this._mintAmounts
  }

  /**
   * Returns the amounts of underlying tokens of this limit-order position if it is settled. Returns nothing if this
   * position is not a limit order.
   */
  public get settleAmounts(): Readonly<{ amount0?: JSBI; amount1?: JSBI }> {
    if (this._settleAmounts == null) {
      this._settleAmounts = this.isLimitOrder ? this.amountsAtPrice(this.sqrtPriceSettle) : {}
    }
    return this._settleAmounts
  }

  /**
   * Returns the minimum input amounts you _want_ to pay in order to safely mint the exact amount of liquidity of this position
   * considering the given slippage tolerance.
   *
   * Hence, the output amounts must be less than the actual required amounts to mint.
   * Also, this is NOT the minimum input amounts _required_ to mint the exact amount of liquidity with the given slippage.
   */
  public mintAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    const sqrtPLower = this.sqrtPriceLower
    const sqrtPUpper = this.sqrtPriceUpper

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

  /**
   * Returns the minimum output amounts expected from burning the liquidity of this position with the given slippage tolerance
   * (Note that this is not for settled position)
   */
  public burnAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    const sqrtPLower = this.sqrtPriceLower
    const sqrtPUpper = this.sqrtPriceUpper

    // calculate the most tolerated tier current sqrt prices with slippage
    const { sqrtPriceSlippageLower, sqrtPriceSlippageUpper } = this.poolTier.sqrtPriceAfterSlippage(slippageTolerance)

    if (this.settled) {
      return PoolMath.minOutputAmountsForLiquidityD8(
        this.limitOrderType === LimitOrderType.ZeroForOne ? sqrtPUpper : sqrtPLower,
        sqrtPLower,
        sqrtPUpper,
        this.liquidityD8
      )
    }

    // calculate minimum output amounts from burning the liquidity under the tolerated current tier price
    const { amount0 } = PoolMath.minOutputAmountsForLiquidityD8(sqrtPriceSlippageUpper, sqrtPLower, sqrtPUpper, this.liquidityD8) // prettier-ignore
    const { amount1 } = PoolMath.minOutputAmountsForLiquidityD8(sqrtPriceSlippageLower, sqrtPLower, sqrtPUpper, this.liquidityD8) // prettier-ignore
    return { amount0, amount1 }
  }
}
