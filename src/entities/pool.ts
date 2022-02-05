import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { Tier, TierChainData } from './tier'

export class Pool {
  public readonly token0: Token
  public readonly token1: Token
  public readonly tickSpacing: number
  public readonly tiers: Tier[]

  public constructor(tokenA: Token, tokenB: Token, tickSpacing: number, tiers: Tier[]) {
    invariant(tickSpacing > 0, 'TICK_SPACING')
    invariant(tiers.length > 0, 'ZERO_TIERS')
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.tickSpacing = tickSpacing
    this.tiers = tiers.slice()
  }

  static fromChainData(tokenA: Token, tokenB: Token, tickSpacing: number, tierDataList: TierChainData[]) {
    const tiers = tierDataList.map(tierData => Tier.fromChainData(tokenA, tokenB, tierData))
    return new Pool(tokenA, tokenB, tickSpacing, tiers)
  }

  public getTierBySqrtGamma(sqrtGamma: number | undefined): [number, Tier | undefined] {
    if (sqrtGamma == null) return [-1, undefined]
    const tier = this.tiers.find(tier => tier.sqrtGamma === sqrtGamma)
    const tierId = tier ? this.tiers.indexOf(tier) : -1
    return [tierId, tier]
  }

  public get poolId(): string {
    return keccak256(defaultAbiCoder.encode(['address', 'address'], [this.token0.address, this.token1.address]))
  }

  /**
   * Returns the chain ID of the tokens in the pool.
   */
  public get chainId(): number {
    return this.token0.chainId
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
   * Return the tier with the most liquidity
   */
  public get mostLiquidTier(): Tier {
    return this.tiers.slice(1).reduce((acc, tier) => {
      return JSBI.greaterThan(tier.liquidity, acc.liquidity) ? tier : acc
    }, this.tiers[0])
  }
}
