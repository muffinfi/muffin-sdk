import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { BASE_LIQUIDITY_D8 } from '../constants'
import { ceilDiv } from '../utils/ceilDiv'
import { Tier, TierChainData } from './tier'

export class Pool {
  public readonly token0: Token
  public readonly token1: Token
  public readonly tickSpacing: number
  public readonly tiers: Tier[]

  /**
   * Construct a pool
   */
  public constructor(tokenA: Token, tokenB: Token, tickSpacing: number, tiers: Tier[]) {
    invariant(tickSpacing > 0, 'TICK_SPACING')
    invariant(tiers.length > 0, 'ZERO_TIERS')
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.tickSpacing = tickSpacing
    this.tiers = [...tiers]
    invariant(
      tiers.every((tier) => tier.token0.equals(this.token0) && tier.token1.equals(this.token1)),
      'TIERS_UNDERLYINGS'
    )
  }

  /**
   * Construct a pool using the tier's data retreived from chain directly
   */
  static fromChainData(tokenA: Token, tokenB: Token, tickSpacing: number, tierDataList: TierChainData[]): Pool {
    const tiers = tierDataList.map((tierData) => Tier.fromChainData(tokenA, tokenB, tierData))
    return new Pool(tokenA, tokenB, tickSpacing, tiers)
  }

  /**
   * Compute pool id
   */
  static computePoolId(tokenA: Token, tokenB: Token): string {
    const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    return keccak256(defaultAbiCoder.encode(['address', 'address'], [token0.address, token1.address]))
  }

  /**
   * Compute pool id
   */
  public get poolId(): string {
    return keccak256(defaultAbiCoder.encode(['address', 'address'], [this.token0.address, this.token1.address]))
  }

  /**
   * Get the chain ID of the tokens in the pool.
   */
  public get chainId(): number {
    return this.token0.chainId
  }

  /**
   * Find a tier of a specific fee tier.
   * @return [tierId, Tier] if found. Otherwise, return [-1, undefined].
   */
  public getTierBySqrtGamma(sqrtGamma: number | undefined): [number, Tier | undefined] {
    if (sqrtGamma == null) return [-1, undefined]
    const tier = this.tiers.find((tier) => tier.sqrtGamma === sqrtGamma)
    const tierId = tier ? this.tiers.indexOf(tier) : -1
    return [tierId, tier]
  }

  /**
   * Returns true if the token is either token0 or token1
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Return true if this pool and all tiers equal another
   */
  public equals(other: Pool): boolean {
    if (!this.token0.equals(other.token0)) return false
    if (!this.token1.equals(other.token1)) return false
    if (this.tickSpacing !== other.tickSpacing) return false
    if (this.tiers.length !== other.tiers.length) return false
    for (const [i, tier] of this.tiers.entries()) if (!tier.equals(other.tiers[i])) return false
    return true
  }

  /**
   * Return the amount of token0 required to create a tier
   */
  public get token0AmountForCreateTier(): CurrencyAmount<Token> {
    // i.e. (baseLiquidityD8 << 80) / sqrtPrice
    const amount0 = ceilDiv(JSBI.leftShift(BASE_LIQUIDITY_D8, JSBI.BigInt(80)), this.tiers[0].sqrtPriceX72)
    return CurrencyAmount.fromRawAmount(this.token0, amount0)
  }

  /**
   * Return the amount of token1 required to create a tier
   */
  public get token1AmountForCreateTier(): CurrencyAmount<Token> {
    // i.e. (baseLiquidityD8 * sqrtPrice) / (1 << 64)
    const amount1 = ceilDiv(
      JSBI.multiply(BASE_LIQUIDITY_D8, this.tiers[0].sqrtPriceX72),
      JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(64))
    )
    return CurrencyAmount.fromRawAmount(this.token1, amount1)
  }
}
