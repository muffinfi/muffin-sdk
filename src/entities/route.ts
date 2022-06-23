import { Currency, Price, Token } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { MAX_TIER_CHOICES } from '../constants'
import { Pool } from './pool'

/**
 * Represents a list of pools through which a swap can occur
 */
export class Route<TInput extends Currency, TOutput extends Currency> {
  public readonly pools: Pool[]
  public readonly tokenPath: Token[]
  public readonly tierChoicesList: number[]
  public readonly input: TInput
  public readonly output: TOutput

  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  public constructor(pools: Pool[], tierChoicesList: number[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS')

    //  check all pools on same chain
    const chainId = pools[0].chainId
    const allSameChain = pools.every((pool) => pool.chainId === chainId)
    invariant(allSameChain, 'CHAIN_IDS')

    // check all first and last pools correct with input and output tokens
    const wrappedInput = input.wrapped
    invariant(pools[0].involvesToken(wrappedInput), 'INPUT')
    invariant(pools[pools.length - 1].involvesToken(output.wrapped), 'OUTPUT')

    // check tier choices
    invariant(
      tierChoicesList.every((choices) => choices > 0 && choices <= MAX_TIER_CHOICES),
      'TIER_CHOICES'
    )
    invariant(tierChoicesList.length === pools.length, 'TIER_CHOICES_COUNT')

    // make an array of Token from input to output
    const tokenPath: Token[] = [wrappedInput]
    let token: Token = tokenPath[0]
    for (const pool of pools) {
      invariant(token.equals(pool.token0) || token.equals(pool.token1), 'PATH')
      token = token.equals(pool.token0) ? pool.token1 : pool.token0
      tokenPath.push(token)
    }

    this.pools = pools
    this.tokenPath = tokenPath
    this.tierChoicesList = tierChoicesList
    this.input = input
    this.output = output ?? tokenPath[tokenPath.length - 1]
  }

  public get chainId(): number {
    return this.pools[0].chainId
  }

  public get midPrice(): Price<TInput, TOutput> {
    throw new Error('Mid price not supported')
  }

  public equals(other: Route<Currency, Currency>): boolean {
    if (this.pools.length !== other.pools.length) return false
    if (this.pools.some((pool, i) => !pool.equals(other.pools[i]))) return false
    if (this.tierChoicesList.length !== other.tierChoicesList.length) return false
    if (this.tierChoicesList.some((tierChoices, i) => tierChoices !== other.tierChoicesList[i])) return false
    return this.input.equals(other.input) && this.output.equals(other.output)
  }
}
