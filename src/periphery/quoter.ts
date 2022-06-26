import { Interface } from '@ethersproject/abi'
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { abi as QuoterABI } from '../artifacts/contracts/periphery/lens/IQuoter.sol/IQuoter.json'
import { Route } from '../entities/route'
import { MethodParameters, toHex } from '../utils/calldata'
import { encodeRouteToPath } from './encodeRouteToPath'

export abstract class SwapQuoter {
  public static INTERFACE = new Interface(QuoterABI)

  /**
   * Produces the calldatas for quoting a swap on-chain through the quoter contract.
   * @param route The swap route, a list of pools through which a swap can occur
   * @param amount The amount of the quote, either an amount in, or an amount out
   * @param tradeType The trade type, either exact input or exact output
   * @returns The formatted calldata
   */
  public static quoteCallParameters<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amount: CurrencyAmount<TInput | TOutput>,
    tradeType: TradeType
  ): MethodParameters {
    const signedAmount = amount.multiply(tradeType == TradeType.EXACT_INPUT ? 1 : -1)

    const calldata =
      route.pools.length === 1
        ? SwapQuoter.INTERFACE.encodeFunctionData(`quoteSingle`, [
            route.tokenPath[0].address,
            route.tokenPath[1].address,
            route.tierChoicesList[0],
            signedAmount.quotient.toString(),
          ])
        : SwapQuoter.INTERFACE.encodeFunctionData('quote', [
            encodeRouteToPath(route, tradeType === TradeType.EXACT_OUTPUT),
            signedAmount.quotient.toString(),
          ])

    return { calldata, value: toHex(0) }
  }

  /**
   * Produces the calldatas for simulate a swap on-chain through the quoter contract.
   * @param route The swap route, a list of pools through which a swap can occur
   * @param amount The amount of the quote, either an amount in, or an amount out
   * @param tradeType The trade type, either exact input or exact output
   * @returns The formatted calldata
   */
  public static simulateCallParameters<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amount: CurrencyAmount<TInput | TOutput>,
    tradeType: TradeType
  ): MethodParameters {
    const signedAmount = amount.multiply(tradeType == TradeType.EXACT_INPUT ? 1 : -1)

    const calldata = SwapQuoter.INTERFACE.encodeFunctionData('simulate', [
      encodeRouteToPath(route, tradeType === TradeType.EXACT_OUTPUT),
      signedAmount.quotient.toString(),
    ])

    return { calldata, value: toHex(0) }
  }
}
