import { Interface } from '@ethersproject/abi'
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { abi as QuoterABI } from '../artifacts/contracts/periphery/lens/Quoter.sol/Quoter.json'
import { Route } from '../entities/route'
import { MethodParameters, toHex } from '../utils/calldata'
import { encodeRouteToPath } from './encodeRouteToPath'

export abstract class SwapQuoter {
  public static INTERFACE = new Interface(QuoterABI)

  public static quoteCallParameters<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amount: CurrencyAmount<TInput | TOutput>,
    tradeType: TradeType
  ): MethodParameters {
    const signedAmount = amount.multiply(tradeType == TradeType.EXACT_INPUT ? 1 : -1)
    const hexAmount = toHex(signedAmount.quotient)

    const calldata: string =
      route.pools.length === 1
        ? SwapQuoter.INTERFACE.encodeFunctionData(`quoteSingle`, [
            route.tokenPath[0].address,
            route.tokenPath[1].address,
            route.tierChoicesList[0],
            hexAmount
          ])
        : SwapQuoter.INTERFACE.encodeFunctionData('quote', [
            encodeRouteToPath(route, tradeType === TradeType.EXACT_OUTPUT),
            hexAmount
          ])

    return { calldata, value: toHex(0) }
  }
}
