import { Currency, CurrencyAmount, Fraction, Percent, Price, TradeType } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { ONE, ZERO } from '../constants'
import { Route } from './route'

type Swap<TInput extends Currency, TOutput extends Currency> = {
  route: Route<TInput, TOutput>
  inputAmount: CurrencyAmount<TInput>
  outputAmount: CurrencyAmount<TOutput>
}

/**
 * Represents a trade executed against a set of routes where some percentage of the input is
 * split across each route.
 *
 * Each route has its own set of pools. Pools can not be re-used across routes.
 *
 * Does not account for slippage, i.e., changes in price environment that can occur between
 * the time the trade is submitted and when it is executed.
 */
export class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
  /** The swaps of the trade, i.e. which routes and how much is swapped in each that make up the trade. */
  public readonly swaps: Swap<TInput, TOutput>[]
  /** The type of the trade, either exact in or exact out. */
  public readonly tradeType: TTradeType

  private _inputAmount?: CurrencyAmount<TInput> // cache
  private _outputAmount?: CurrencyAmount<TOutput> // cache
  private _executionPrice?: Price<TInput, TOutput> // cache

  /**
   * Creates a trade without computing the result of swapping through the route. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  public static createUncheckedTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
    constructorArguments: Swap<TInput, TOutput> & { tradeType: TTradeType }
  ): Trade<TInput, TOutput, TTradeType> {
    return new Trade({
      ...constructorArguments,
      routes: [
        {
          inputAmount: constructorArguments.inputAmount,
          outputAmount: constructorArguments.outputAmount,
          route: constructorArguments.route,
        },
      ],
    })
  }

  /**
   * Creates a trade without computing the result of swapping through the routes. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  public static createUncheckedTradeWithMultipleRoutes<
    TInput extends Currency,
    TOutput extends Currency,
    TTradeType extends TradeType
  >(constructorArguments: {
    routes: Swap<TInput, TOutput>[]
    tradeType: TTradeType
  }): Trade<TInput, TOutput, TTradeType> {
    return new Trade(constructorArguments)
  }

  /**
   * Construct a trade by passing in the pre-computed property values
   * @param routes The routes through which the trade occurs
   * @param tradeType The type of trade, exact input or exact output
   */
  public constructor({ routes, tradeType }: { routes: Swap<TInput, TOutput>[]; tradeType: TTradeType }) {
    const inputCurrency = routes[0].inputAmount.currency
    const outputCurrency = routes[0].outputAmount.currency
    invariant(
      routes.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      'INPUT_CURRENCY_MATCH'
    )
    invariant(
      routes.every(({ route }) => outputCurrency.wrapped.equals(route.output.wrapped)),
      'OUTPUT_CURRENCY_MATCH'
    )

    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0)
    const poolIdSet = new Set<string>()
    for (const { route } of routes) {
      for (const pool of route.pools) {
        poolIdSet.add(pool.poolId)
      }
    }
    invariant(numPools == poolIdSet.size, 'POOLS_DUPLICATED')

    this.swaps = routes
    this.tradeType = tradeType
  }

  /**
   * The input token currency of this trade
   */
  public get inputCurrency(): TInput {
    return this.swaps[0].inputAmount.currency
  }

  /**
   * The output token currency of this trade
   */
  public get outputCurrency(): TOutput {
    return this.swaps[0].outputAmount.currency
  }

  /**
   * The input amount for the trade assuming no slippage.
   */
  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) return this._inputAmount

    let amount = CurrencyAmount.fromRawAmount(this.swaps[0].inputAmount.currency, 0)
    for (const swap of this.swaps) amount = amount.add(swap.inputAmount)
    return (this._inputAmount = amount)
  }

  /**
   * The output amount for the trade assuming no slippage.
   */
  public get outputAmount(): CurrencyAmount<TOutput> {
    if (this._outputAmount) return this._outputAmount

    let amount = CurrencyAmount.fromRawAmount(this.swaps[0].outputAmount.currency, 0)
    for (const swap of this.swaps) amount = amount.add(swap.outputAmount)
    return (this._outputAmount = amount)
  }

  /**
   * The price expressed in terms of output amount over input amount.
   */
  public get executionPrice(): Price<TInput, TOutput> {
    return (
      this._executionPrice ??
      (this._executionPrice = new Price(
        this.inputAmount.currency,
        this.outputAmount.currency,
        this.inputAmount.quotient,
        this.outputAmount.quotient
      ))
    )
  }

  /**
   * Returns the percent difference between the route's mid price and the price impact
   */
  public get priceImpact(): Percent {
    // TODO: can simulate it if swap is implemented?
    throw new Error('Mid price not supported')
  }

  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  public minimumAmountOut(slippageTolerance: Percent, amountOut = this.outputAmount): CurrencyAmount<TOutput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_OUTPUT) {
      return amountOut
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE)
        .add(slippageTolerance)
        .invert()
        .multiply(amountOut.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut)
    }
  }

  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  public maximumAmountIn(slippageTolerance: Percent, amountIn = this.inputAmount): CurrencyAmount<TInput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_INPUT) {
      return amountIn
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE).add(slippageTolerance).multiply(amountIn.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountIn.currency, slippageAdjustedAmountIn)
    }
  }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
   */
  public worstExecutionPrice(slippageTolerance: Percent): Price<TInput, TOutput> {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn(slippageTolerance).quotient,
      this.minimumAmountOut(slippageTolerance).quotient
    )
  }
}

// /**
//  * Trades comparator, an extension of the input output comparator that also considers other dimensions of the trade in ranking them
//  * @template TInput The input token, either Ether or an ERC-20
//  * @template TOutput The output token, either Ether or an ERC-20
//  * @template TTradeType The trade type, either exact input or exact output
//  * @param a The first trade to compare
//  * @param b The second trade to compare
//  * @returns A sorted ordering for two neighboring elements in a trade array
//  */
// export function tradeComparator<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
//   a: Trade<TInput, TOutput, TTradeType>,
//   b: Trade<TInput, TOutput, TTradeType>
// ) {
//   // must have same input and output token for comparison
//   invariant(a.inputAmount.currency.equals(b.inputAmount.currency), 'INPUT_CURRENCY')
//   invariant(a.outputAmount.currency.equals(b.outputAmount.currency), 'OUTPUT_CURRENCY')
//   if (a.outputAmount.equalTo(b.outputAmount)) {
//     if (a.inputAmount.equalTo(b.inputAmount)) {
//       // consider the number of hops since each hop costs gas
//       const aHops = a.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0)
//       const bHops = b.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0)
//       return aHops - bHops
//     }
//     // trade A requires less input than trade B, so A should come first
//     if (a.inputAmount.lessThan(b.inputAmount)) {
//       return -1
//     } else {
//       return 1
//     }
//   } else {
//     // tradeA has less output than trade B, so should come second
//     if (a.outputAmount.lessThan(b.outputAmount)) {
//       return 1
//     } else {
//       return -1
//     }
//   }
// }
