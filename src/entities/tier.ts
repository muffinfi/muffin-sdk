import { BigintIsh, Fraction, Percent, Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE, Q144 } from '../constants'
import { encodeSqrtPriceX72, sqrtGammaToFee } from '../utils/misc'
import { TickMath } from '../utils/tickMath'

type BigNumberish = BigintIsh | { toString(): string }

export type TierChainData = {
  liquidity: BigNumberish
  sqrtPrice: BigNumberish
  sqrtGamma: number
  tick: number
  nextTickBelow: number
  nextTickAbove: number
  feeGrowthGlobal0: BigNumberish
  feeGrowthGlobal1: BigNumberish
}

export class Tier {
  public readonly token0: Token
  public readonly token1: Token
  public readonly liquidity: JSBI
  public readonly sqrtPriceX72: JSBI
  public readonly sqrtGamma: number
  public readonly nextTickBelow: number
  public readonly nextTickAbove: number

  // cache
  private _token0Price?: Price<Token, Token>
  private _token1Price?: Price<Token, Token>
  private _tickCurrent?: number

  /**
   * Construct a tier
   */
  public constructor(
    tokenA: Token,
    tokenB: Token,
    liquidity: BigintIsh,
    sqrtPriceX72: BigintIsh,
    sqrtGamma: number,
    nextTickBelow: number,
    nextTickAbove: number
  ) {
    invariant(nextTickBelow < nextTickAbove, 'NEXT_TICKS_ORDER')
    invariant(Number.isInteger(nextTickBelow) && Number.isInteger(nextTickAbove), 'NEXT_TICKS')
    invariant(Number.isInteger(sqrtGamma) && sqrtGamma > 0 && sqrtGamma <= 100_000, 'FEE')
    //
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.liquidity = JSBI.BigInt(liquidity)
    this.sqrtPriceX72 = JSBI.BigInt(sqrtPriceX72)
    this.sqrtGamma = sqrtGamma
    this.nextTickBelow = nextTickBelow
    this.nextTickAbove = nextTickAbove
  }

  /**
   * Construct a tier using data retreived from chain directly
   */
  static fromChainData(tokenA: Token, tokenB: Token, data: TierChainData): Tier {
    return new Tier(
      tokenA,
      tokenB,
      JSBI.BigInt(data.liquidity),
      JSBI.BigInt(data.sqrtPrice),
      data.sqrtGamma,
      data.nextTickBelow,
      data.nextTickAbove
    )
  }

  /**
   * Returns true if the token is either token0 or token1
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Returns true if this tier is equal to the given tier
   */
  public equals(other: Tier): boolean {
    return (
      this.token0.equals(other.token0) &&
      this.token1.equals(other.token1) &&
      JSBI.equal(this.liquidity, other.liquidity) &&
      JSBI.equal(this.sqrtPriceX72, other.sqrtPriceX72) &&
      this.sqrtGamma === other.sqrtGamma &&
      this.nextTickBelow === other.nextTickBelow &&
      this.nextTickAbove === other.nextTickAbove
    )
  }

  /**
   * Return the price of the given token denominated in the other token in the pool.
   * E.g. priceOf(token0) = Price of token0 in token1 = How many token1 is worth one token0
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  /**
   * Spot price of token0 denominated in token1
   */
  public get token0Price(): Price<Token, Token> {
    const priceX144 = JSBI.multiply(this.sqrtPriceX72, this.sqrtPriceX72)
    return this._token0Price ?? (this._token0Price = new Price(this.token0, this.token1, Q144, priceX144))
  }

  /**
   * Spot price of token1 denominated in token0
   */
  public get token1Price(): Price<Token, Token> {
    const priceX144 = JSBI.multiply(this.sqrtPriceX72, this.sqrtPriceX72)
    return this._token1Price ?? (this._token1Price = new Price(this.token1, this.token0, priceX144, Q144))
  }

  /**
   * Current tick of the tier
   */
  public get tickCurrent(): number {
    if (this._tickCurrent == null) {
      let tick = TickMath.sqrtPriceX72ToTick(this.sqrtPriceX72)
      if (tick == this.nextTickAbove) tick--
      this._tickCurrent = tick
    }
    return this._tickCurrent
  }

  /**
   * @deprecated
   * @alias Tier.tickCurrent
   */
  public get computedTick(): number {
    return this.tickCurrent
  }

  /**
   * Swap fee rate
   */
  public get fee(): Fraction {
    return sqrtGammaToFee(this.sqrtGamma)
  }

  /**
   * Swap fee rate (in %)
   */
  public get feePercent(): Fraction {
    return this.fee.multiply(100)
  }

  /**
   * Calculate the upper and lower sqrt prices after a given slippage
   * @param slippage Percentage of slippage, e.g. 10% means to calculate sqrt prices after price moves ±10%
   * @returns Sqrt prices after slippage, bound in [MIN_SQRT_PRICE, MAX_SQRT_PRICE]
   */
  public sqrtPriceAfterSlippage(slippage: Percent): {
    sqrtPriceSlippageLower: JSBI
    sqrtPriceSlippageUpper: JSBI
  } {
    const priceLower = this.token0Price.asFraction.multiply(new Percent(1).subtract(slippage))
    const priceUpper = this.token0Price.asFraction.multiply(slippage.add(1))

    let sqrtPLower = encodeSqrtPriceX72(priceLower.numerator, priceLower.denominator)
    let sqrtPUpper = encodeSqrtPriceX72(priceUpper.numerator, priceUpper.denominator)

    if (JSBI.lessThan(sqrtPLower, MIN_SQRT_PRICE)) sqrtPLower = MIN_SQRT_PRICE
    if (JSBI.greaterThan(sqrtPUpper, MAX_SQRT_PRICE)) sqrtPUpper = MAX_SQRT_PRICE

    return {
      sqrtPriceSlippageLower: sqrtPLower,
      sqrtPriceSlippageUpper: sqrtPUpper,
    }
  }
}
