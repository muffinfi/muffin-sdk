import { BigintIsh, Fraction, Percent, Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { MAX_SQRT_P, MIN_SQRT_P, Q144 } from '../constants'
import { encodeSqrtPriceX72, sqrtGammaToFee } from '../utils/misc'
import { TickMath } from '../utils/tickMath'

export type TierChainData = {
  liquidity: BigintIsh
  sqrtPrice: BigintIsh
  sqrtGamma: number
  tick: number
  nextTickBelow: number
  nextTickAbove: number
  feeGrowthGlobal0: BigintIsh
  feeGrowthGlobal1: BigintIsh
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
  private _computedTick?: number

  public constructor(
    tokenA: Token,
    tokenB: Token,
    liquidity: BigintIsh,
    sqrtPriceX72: BigintIsh,
    sqrtGamma: number,
    nextTickBelow: number,
    nextTickAbove: number
  ) {
    invariant(nextTickBelow < nextTickAbove, 'invalid next ticks')
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.liquidity = JSBI.BigInt(liquidity)
    this.sqrtPriceX72 = JSBI.BigInt(sqrtPriceX72)
    this.sqrtGamma = sqrtGamma
    this.nextTickBelow = nextTickBelow
    this.nextTickAbove = nextTickAbove
  }

  static fromChainData(tokenA: Token, tokenB: Token, data: TierChainData): Tier {
    return new Tier(
      tokenA,
      tokenB,
      data.liquidity,
      data.sqrtPrice,
      data.sqrtGamma,
      data.nextTickBelow,
      data.nextTickAbove
    )
  }

  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

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
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  public get token0Price(): Price<Token, Token> {
    const priceX144 = JSBI.multiply(this.sqrtPriceX72, this.sqrtPriceX72)
    return this._token0Price ?? (this._token0Price = new Price(this.token0, this.token1, Q144, priceX144))
  }

  public get token1Price(): Price<Token, Token> {
    const priceX144 = JSBI.multiply(this.sqrtPriceX72, this.sqrtPriceX72)
    return this._token1Price ?? (this._token1Price = new Price(this.token1, this.token0, priceX144, Q144))
  }

  public get computedTick(): number {
    if (this._computedTick == null) {
      let tick = TickMath.sqrtPriceX72ToTick(this.sqrtPriceX72)
      if (tick == this.nextTickAbove) tick--
      this._computedTick = tick
    }
    return this._computedTick
  }

  public get fee(): Fraction {
    return sqrtGammaToFee(this.sqrtGamma)
  }

  public get feePercent(): Fraction {
    return this.fee.multiply(100)
  }

  public sqrtPriceAfterSlippage(
    slippageTolerance: Percent
  ): { sqrtPriceSlippageLower: JSBI; sqrtPriceSlippageUpper: JSBI } {
    const priceLower = this.token0Price.asFraction.multiply(new Percent(1).subtract(slippageTolerance))
    const priceUpper = this.token0Price.asFraction.multiply(slippageTolerance.add(1))

    let sqrtPLower = encodeSqrtPriceX72(priceLower.numerator, priceLower.denominator)
    let sqrtPUpper = encodeSqrtPriceX72(priceUpper.numerator, priceUpper.denominator)

    if (JSBI.lessThanOrEqual(sqrtPLower, MIN_SQRT_P)) sqrtPLower = JSBI.add(MIN_SQRT_P, JSBI.BigInt(1))
    if (JSBI.greaterThanOrEqual(sqrtPUpper, MAX_SQRT_P)) sqrtPUpper = JSBI.subtract(MAX_SQRT_P, JSBI.BigInt(1))

    return {
      sqrtPriceSlippageLower: sqrtPLower,
      sqrtPriceSlippageUpper: sqrtPUpper
    }
  }
}
