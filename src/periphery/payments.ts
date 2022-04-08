import { Interface } from '@ethersproject/abi'
import { validateAndParseAddress } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { abi as ManagerBaseABI } from '../artifacts/contracts/periphery/base/ManagerBase.sol/ManagerBase.json'
import { toHex } from '../utils/calldata'

export abstract class Payments {
  public static INTERFACE = new Interface(ManagerBaseABI)

  public static encodeUnwrapWETH(amountMinimum: JSBI, recipient: string): string {
    return Payments.INTERFACE.encodeFunctionData('unwrapWETH', [
      toHex(amountMinimum),
      validateAndParseAddress(recipient),
    ])
  }

  public static encodeRefundETH(): string {
    return Payments.INTERFACE.encodeFunctionData('refundETH')
  }
}
