import { Interface } from '@ethersproject/abi'
import { Currency, CurrencyAmount, validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { abi as ManagerBaseABI } from '../artifacts/contracts/periphery/base/ManagerBase.sol/ManagerBase.json'
import { MethodParameters, toHex } from '../utils/calldata'
import { Multicall } from './multicall'
import { PermitOptions, SelfPermit } from './selfPermit'

/**
 * Options for producing the arguments to send calls to the manager.
 */
export interface AccountCallOptions {
  recipient: string //                  The recipient of the token deposit
  managerAddress: string //             Address of the account manager contract
}

/**
 * Options for producing the arguments to send deposit calls to the manager
 */
export interface DepositCallOptions extends AccountCallOptions {
  inputTokenPermit?: PermitOptions // The optional permit parameters for spending the input
}

export abstract class AccountManager {
  public static INTERFACE = new Interface(ManagerBaseABI)

  private static depositCalldatas(
    currencyAmount: CurrencyAmount<Currency>,
    options: DepositCallOptions // options.recipient should be already validated
  ): { calldatas: string[]; value: string | null } {
    // Amount should be greater then zero.
    invariant(currencyAmount.greaterThan(0), 'DEPOSIT_AMOUNT')

    const calldatas: string[] = []

    if (currencyAmount.currency.isToken && options.inputTokenPermit) {
      // Currency should be a token
      calldatas.push(SelfPermit.encodePermit(currencyAmount.currency, options.inputTokenPermit))
    }

    calldatas.push(
      AccountManager.INTERFACE.encodeFunctionData('deposit', [
        options.recipient,
        currencyAmount.currency.isNative ? currencyAmount.currency.wrapped.address : currencyAmount.currency.address,
        toHex(currencyAmount.quotient),
      ])
    )

    const value = currencyAmount.currency.isNative ? toHex(currencyAmount.quotient) : null

    return { calldatas, value }
  }

  private static withdrawCalldata(
    currencyAmount: CurrencyAmount<Currency>,
    options: AccountCallOptions // options.recipient should be already validated
  ): string[] {
    // Amount should be greater then zero.
    invariant(currencyAmount.greaterThan(0), 'WITHDRAW_AMOUNT')

    if (currencyAmount.currency.isNative) {
      return [
        // First withdraw into manager
        AccountManager.INTERFACE.encodeFunctionData('withdraw', [
          options.managerAddress,
          currencyAmount.currency.wrapped.address,
          toHex(currencyAmount.quotient),
        ]),
        // Then unwrap and send to recipient
        AccountManager.INTERFACE.encodeFunctionData('unwrapWETH', [toHex(currencyAmount.quotient), options.recipient]),
      ]
    }

    return [
      AccountManager.INTERFACE.encodeFunctionData('withdraw', [
        options.recipient,
        currencyAmount.currency.address,
        toHex(currencyAmount.quotient),
      ]),
    ]
  }

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given deposit
   * @param currencyAmount deposit amount with token info
   * @param options options for the call parameters
   * @returns
   */
  public static depositSingleCallParameters(
    currencyAmount: CurrencyAmount<Currency>,
    options: DepositCallOptions
  ): MethodParameters {
    const { calldatas, value } = AccountManager.depositCalldatas(currencyAmount, {
      ...options,
      recipient: validateAndParseAddress(options.recipient),
      managerAddress: validateAndParseAddress(options.managerAddress),
    })

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: value ? value : toHex(0),
    }
  }

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for multiple deposit
   * @param currencyAmounts deposit amount with token info
   * @param options options for the call parameters
   * @returns
   */
  public static depositCallParameters(
    currencyAmounts: CurrencyAmount<Currency>[],
    options: AccountCallOptions & {
      inputTokenPermits?: { [tokenAddress: string]: PermitOptions } // The optional permit parameters for spending the input for each token, keyed by token address
    }
  ): MethodParameters {
    const defaultSingleOption: AccountCallOptions = {
      recipient: validateAndParseAddress(options.recipient),
      managerAddress: validateAndParseAddress(options.managerAddress),
    }

    const { calldatas, value } = currencyAmounts.reduce(
      (acc, currencyAmount) => {
        const inputTokenPermit = currencyAmount.currency.isToken
          ? options.inputTokenPermits?.[currencyAmount.currency.address]
          : undefined
        const { calldatas, value } = AccountManager.depositCalldatas(currencyAmount, {
          ...defaultSingleOption,
          inputTokenPermit,
        })
        acc.calldatas.push(...calldatas)
        if (value) {
          acc.value = toHex(JSBI.add(JSBI.BigInt(acc.value), JSBI.BigInt(value)))
        }
        return acc
      },
      { calldatas: [], value: toHex(0) } as {
        calldatas: string[]
        value: string
      }
    )

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value,
    }
  }

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given withdrawal
   * @param currencyAmount withdrawal amount with token info
   * @param options options for the call parameters
   * @returns
   */
  public static withdrawSingleCallParameters(
    currencyAmount: CurrencyAmount<Currency>,
    options: AccountCallOptions
  ): MethodParameters {
    const calldata = AccountManager.withdrawCalldata(currencyAmount, {
      recipient: validateAndParseAddress(options.recipient),
      managerAddress: validateAndParseAddress(options.managerAddress),
    })

    return {
      calldata: Multicall.encodeMulticall(calldata),
      value: toHex(0),
    }
  }

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for multiple withdrawals
   * @param currencyAmounts withdrawal amount with token info
   * @param options options for the call parameters
   * @returns
   */
  public static withdrawCallParameters(
    currencyAmounts: CurrencyAmount<Currency>[],
    options: AccountCallOptions
  ): MethodParameters {
    const validatedOptions: AccountCallOptions = {
      recipient: validateAndParseAddress(options.recipient),
      managerAddress: validateAndParseAddress(options.managerAddress),
    }

    const calldatas = currencyAmounts.reduce((acc, currencyAmount) => {
      acc.push(...AccountManager.withdrawCalldata(currencyAmount, validatedOptions))
      return acc
    }, [] as string[])

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }
}
