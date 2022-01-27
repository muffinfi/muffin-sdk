import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { Token } from '@uniswap/sdk-core'
import { Tier, TierChainData } from './tier'

export class Pool {
  public readonly token0: Token
  public readonly token1: Token
  public readonly tickSpacing: number
  public readonly tiers: Tier[]

  public constructor(tokenA: Token, tokenB: Token, tickSpacing: number, tiers: Tier[]) {
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
}
