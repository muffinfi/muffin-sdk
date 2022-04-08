import { Interface } from '@ethersproject/abi'
import { BigintIsh, Currency, CurrencyAmount, Percent, TradeType, validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { abi as SwapManagerABI } from '../artifacts/contracts/periphery/base/SwapManager.sol/SwapManager.json'
import { SWAP_AMOUNT_TOLERANCE } from '../constants'
import { Trade } from '../entities/trade'
import { MethodParameters, toHex } from '../utils/calldata'
import { encodeRouteToPath } from './encodeRouteToPath'
import { Multicall } from './multicall'
import { Payments } from './payments'
import { PermitOptions, SelfPermit } from './selfPermit'

/**
 * Options for producing the arguments to send calls to the manager.
 */
export interface SwapOptions {
  recipient: string //                The account that should receive the output.
  fromAccount: boolean //             Use internal account to pay the swap input token
  toAccount: boolean //               Send swap output token to recipient internal account
  slippageTolerance: Percent //       How much the execution price is allowed to move unfavorably from the trade execution price.
  deadline: BigintIsh //              When the transaction expires, in epoch seconds.
  inputTokenPermit?: PermitOptions // The optional permit parameters for spending the input.
  managerAddress?: string //          Address of the swap manager contract
}

export abstract class SwapManager {
  public static INTERFACE = new Interface(SwapManagerABI)

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
   * @param trade to produce call parameters for
   * @param options options for the call parameters
   */
  public static swapCallParameters(
    trades: Trade<Currency, Currency, TradeType> | Trade<Currency, Currency, TradeType>[],
    options: SwapOptions
  ): MethodParameters {
    if (!Array.isArray(trades)) trades = [trades]

    const sampleTrade = trades[0]
    const tokenIn = sampleTrade.inputAmount.currency.wrapped
    const tokenOut = sampleTrade.outputAmount.currency.wrapped

    // All trades should have the same starting and ending token.
    invariant(
      trades.every((trade) => trade.inputAmount.currency.wrapped.equals(tokenIn)),
      'TOKEN_IN_DIFF'
    )
    invariant(
      trades.every((trade) => trade.outputAmount.currency.wrapped.equals(tokenOut)),
      'TOKEN_OUT_DIFF'
    )

    const calldatas: string[] = []
    const ZERO_IN = CurrencyAmount.fromRawAmount(trades[0].inputAmount.currency, 0)
    const ZERO_OUT = CurrencyAmount.fromRawAmount(trades[0].outputAmount.currency, 0)

    // calculate total output amount with slippage tolerance
    const totalAmountOut = trades.reduce(
      (sum, trade) => sum.add(trade.minimumAmountOut(options.slippageTolerance)),
      ZERO_OUT
    )

    // flags for whether input / output is native Peth
    const inputIsNative = sampleTrade.inputAmount.currency.isNative
    const outputIsNative = sampleTrade.outputAmount.currency.isNative

    // flag for whether a refund needs to happen
    const mustRefund =
      !options.fromAccount &&
      sampleTrade.inputAmount.currency.isNative &&
      sampleTrade.tradeType === TradeType.EXACT_OUTPUT

    // flags for whether funds should be send first to the manager
    const managerMustCustody = !options.toAccount && outputIsNative
    invariant(!managerMustCustody || options.managerAddress, 'MISSING_MANAGER_ADDRESS')

    // calculate msg.value if input is eth (or native coin)
    const totalTxValue: CurrencyAmount<Currency> =
      !options.fromAccount && inputIsNative
        ? trades.reduce((sum, trade) => sum.add(trade.maximumAmountIn(options.slippageTolerance)), ZERO_IN)
        : ZERO_IN

    // encode permit if necessary
    if (options.inputTokenPermit) {
      invariant(sampleTrade.inputAmount.currency.isToken, 'NON_TOKEN_PERMIT')
      calldatas.push(SelfPermit.encodePermit(sampleTrade.inputAmount.currency, options.inputTokenPermit))
    }

    const recipient = validateAndParseAddress(options.recipient)
    const deadline = toHex(options.deadline)

    for (const trade of trades) {
      for (const { route, inputAmount, outputAmount } of trade.swaps) {
        const amountIn = toHex(trade.maximumAmountIn(options.slippageTolerance, inputAmount).quotient)
        const amountOut = toHex(trade.minimumAmountOut(options.slippageTolerance, outputAmount).quotient)
        const swapRecipient = managerMustCustody ? options.managerAddress : recipient

        if (route.pools.length === 1) {
          const calldata =
            trade.tradeType === TradeType.EXACT_INPUT
              ? SwapManager.INTERFACE.encodeFunctionData('exactInSingle', [
                  route.tokenPath[0].address,
                  route.tokenPath[1].address,
                  route.tierChoicesList[0],
                  amountIn,
                  amountOut,
                  swapRecipient,
                  options.fromAccount,
                  options.toAccount,
                  deadline,
                ])
              : SwapManager.INTERFACE.encodeFunctionData('exactOutSingle', [
                  route.tokenPath[0].address,
                  route.tokenPath[1].address,
                  route.tierChoicesList[0],
                  amountOut,
                  amountIn,
                  swapRecipient,
                  options.fromAccount,
                  options.toAccount,
                  deadline,
                ])
          calldatas.push(calldata)
        } else {
          const path = encodeRouteToPath(route, trade.tradeType === TradeType.EXACT_OUTPUT)
          const calldata =
            trade.tradeType === TradeType.EXACT_INPUT
              ? SwapManager.INTERFACE.encodeFunctionData('exactIn', [
                  path,
                  amountIn,
                  amountOut,
                  swapRecipient,
                  options.fromAccount,
                  options.toAccount,
                  deadline,
                ])
              : SwapManager.INTERFACE.encodeFunctionData('exactOut', [
                  path,
                  amountOut,
                  amountIn,
                  swapRecipient,
                  options.fromAccount,
                  options.toAccount,
                  deadline,
                ])
          calldatas.push(calldata)
        }
      }
    }

    // unwrap
    if (managerMustCustody) {
      const amountOut = JSBI.greaterThan(totalAmountOut.quotient, SWAP_AMOUNT_TOLERANCE)
        ? JSBI.subtract(totalAmountOut.quotient, SWAP_AMOUNT_TOLERANCE)
        : JSBI.BigInt(0)
      calldatas.push(Payments.encodeUnwrapWETH(amountOut, recipient))
    }

    // refund
    if (mustRefund) {
      calldatas.push(Payments.encodeRefundETH())
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(totalTxValue.quotient),
    }
  }
}
