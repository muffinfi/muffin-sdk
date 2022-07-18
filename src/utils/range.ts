import { Price, Token } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { MAX_TICK, MIN_TICK } from '../constants'
import { nearestUsableTick, priceToClosestTick, tickToPrice, tryParsePriceString } from './misc'

export class Range {
  public readonly token0: Token
  public readonly token1: Token
  public readonly tickSpacing?: number

  public readonly tickLower: number
  public readonly tickUpper: number
  private _priceLower?: Price<Token, Token>
  private _priceUpper?: Price<Token, Token>

  public readonly inverted: boolean
  public readonly baseToken: Token
  public readonly quoteToken: Token
  private _quotePriceLower?: Price<Token, Token>
  private _quotePriceUpper?: Price<Token, Token>

  /**
   * Round off the given ticks to multiples of tick spacing.
   */
  static fromTickInput(
    baseToken: Token,
    quoteToken: Token,
    tickLowerInput: number,
    tickUpperInput: number,
    tickSpacing: number
  ) {
    const tickLower = nearestUsableTick(Math.max(tickLowerInput, MIN_TICK), tickSpacing)
    const tickUpper = nearestUsableTick(Math.min(tickUpperInput, MAX_TICK), tickSpacing)
    return new this(baseToken, quoteToken, tickLower, tickUpper, tickSpacing)
  }

  /**
   * Sort the given prices by token address in lowercase-alphabetical order.
   * Then, round down the prices into ticks, then rounded off to multiples of tick spacing.
   */
  static fromPriceInput(priceLower: Price<Token, Token>, priceUpper: Price<Token, Token>, tickSpacing: number) {
    const baseToken = priceLower.baseCurrency
    const quoteToken = priceLower.quoteCurrency
    invariant(
      baseToken.equals(priceUpper.baseCurrency) && quoteToken.equals(priceUpper.quoteCurrency),
      'UNMATCHED PRICE UNITS'
    )

    const tickA = nearestUsableTick(priceToClosestTick(priceLower), tickSpacing)
    const tickB = nearestUsableTick(priceToClosestTick(priceUpper), tickSpacing)
    const [tickLower, tickUpper] = tickA < tickB ? [tickA, tickB] : [tickB, tickA]
    return new this(baseToken, quoteToken, tickLower, tickUpper, tickSpacing)
  }

  /**
   * Parse price string into price instances, then create a range using `Range.fromPriceInput`.
   */
  static fromPriceStringInput(
    baseToken: Token,
    quoteToken: Token,
    priceLowerString: string,
    priceUpperString: string,
    tickSpacing: number
  ) {
    const priceLower = tryParsePriceString(baseToken, quoteToken, priceLowerString)
    const priceUpper = tryParsePriceString(baseToken, quoteToken, priceUpperString)
    invariant(priceLower != null && priceUpper != null, 'INVALID PRICE STRING')
    return this.fromPriceInput(priceLower, priceUpper, tickSpacing)
  }

  /**
   * Create a range using exact tick numbers. No roundings will be performed.
   */
  public constructor(baseToken: Token, quoteToken: Token, tickLower: number, tickUpper: number, tickSpacing?: number) {
    invariant(baseToken.address != quoteToken.address, 'SAME TOKEN')
    invariant(Number.isInteger(tickLower) && tickLower >= MIN_TICK, 'LOWER TICK')
    invariant(Number.isInteger(tickUpper) && tickUpper <= MAX_TICK, 'UPPER TICK')
    invariant(tickLower < tickUpper, 'TICK ORDER')

    const sorted = baseToken.sortsBefore(quoteToken)
    this.token0 = sorted ? baseToken : quoteToken
    this.token1 = sorted ? quoteToken : baseToken
    this.tickLower = tickLower
    this.tickUpper = tickUpper

    this.inverted = !sorted
    this.baseToken = baseToken
    this.quoteToken = quoteToken

    if (tickSpacing != null) {
      invariant(Number.isInteger(tickSpacing) && tickSpacing > 0, 'TICK SPACING')
      this.tickSpacing = tickSpacing
    }
  }

  get priceLower() {
    return this._priceLower ?? (this._priceLower = tickToPrice(this.token0, this.token1, this.tickLower))
  }

  get priceUpper() {
    return this._priceUpper ?? (this._priceUpper = tickToPrice(this.token0, this.token1, this.tickUpper))
  }

  get quotePriceLower() {
    return this._quotePriceLower ?? (this._quotePriceLower = this.inverted ? this.priceUpper.invert() : this.priceLower)
  }

  get quotePriceUpper() {
    return this._quotePriceUpper ?? (this._quotePriceUpper = this.inverted ? this.priceLower.invert() : this.priceUpper)
  }

  get tickLimits() {
    if (this.tickSpacing == null) throw new Error('Missing tick spacing')
    return {
      LOWER: nearestUsableTick(MIN_TICK, this.tickSpacing),
      UPPER: nearestUsableTick(MAX_TICK, this.tickSpacing),
    }
  }

  get atTickLimits() {
    const tickLimits = this.tickLimits
    return {
      LOWER: this.tickLower <= tickLimits.LOWER,
      UPPER: this.tickUpper >= tickLimits.UPPER,
    }
  }
}
